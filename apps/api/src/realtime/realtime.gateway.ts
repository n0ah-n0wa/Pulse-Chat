import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';

import { API_ERROR_CODES, CLIENT_SOCKET_EVENTS, SERVER_SOCKET_EVENTS } from '@pulse-chat/shared';

import { REQUEST_ID_HEADER } from '../common/constants/request-id.header.js';
import { ApiException } from '../common/errors/api.exception.js';
import { RequestContextService } from '../infrastructure/logging/request-context.service.js';
import { resolveIncomingRequestId } from '../infrastructure/logging/resolve-request-id.js';
import { StructuredLoggerService } from '../infrastructure/logging/structured-logger.service.js';
import { PresenceService } from '../presence/presence.service.js';
import { userSocketRoom } from './bus/realtime-bus.channels.js';
import { RealtimeAuthenticationService } from './realtime-authentication.service.js';
import { RealtimeConnectionStateService } from './realtime-connection-state.service.js';
import { RealtimeMessageBroadcastService } from './realtime-message-broadcast.service.js';
import { RealtimeMessagesService } from './realtime-messages.service.js';
import { RealtimeRoomSubscriptionsService } from './realtime-room-subscriptions.service.js';
import { RealtimeTypingService } from './realtime-typing.service.js';
import type { AuthenticatedSocket } from './realtime.types.js';
import { socketPayloadCorrelation } from './socket-payload-correlation.js';
import type { Server } from 'socket.io';

@WebSocketGateway({
  path: '/socket.io',
  transports: ['websocket'],
})
export class RealtimeGateway
  implements
    OnGatewayInit,
    OnGatewayConnection<AuthenticatedSocket>,
    OnGatewayDisconnect<AuthenticatedSocket>
{
  private server: Server | undefined;

  constructor(
    private readonly authentication: RealtimeAuthenticationService,
    private readonly connections: RealtimeConnectionStateService,
    private readonly roomSubscriptions: RealtimeRoomSubscriptionsService,
    private readonly messages: RealtimeMessagesService,
    private readonly typing: RealtimeTypingService,
    private readonly messageBroadcast: RealtimeMessageBroadcastService,
    private readonly presence: PresenceService,
    private readonly requestContext: RequestContextService,
    private readonly logger: StructuredLoggerService,
  ) {}

  afterInit(server: Server): void {
    this.server = server;
    this.messageBroadcast.attachServer(server);
    server.use((socket, next) => {
      const requestId = resolveIncomingRequestId(socket.handshake.headers[REQUEST_ID_HEADER]);
      this.requestContext.run({ requestId }, () => {
        try {
          const authenticated = this.authentication.authenticateSocket(
            socket as AuthenticatedSocket,
            requestId,
          );
          (socket as AuthenticatedSocket).data = authenticated;
          next();
        } catch (error) {
          next(error as Error);
        }
      });
    });
  }

  async handleConnection(socket: AuthenticatedSocket): Promise<void> {
    await this.requestContext.run(
      { requestId: socket.data.requestId ?? randomUUID(), userId: socket.data.userId },
      async () => {
        const started = performance.now();
        await this.cleanupStaleSockets(socket.id);
        this.connections.registerConnection(socket.id, socket.data.userId);
        await socket.join(userSocketRoom(socket.data.userId));
        try {
          await this.presence.connect(socket.data.userId, socket.id);
        } catch (error: unknown) {
          this.logger.error('presence.connect_failed', {
            error: error instanceof Error ? error : { message: String(error) },
          });
        }
        this.logger.log('ws.connect', {
          event: 'connection',
          duration: Math.round(performance.now() - started),
        });
      },
    );
  }

  async handleDisconnect(socket: AuthenticatedSocket): Promise<void> {
    await this.requestContext.run(
      { requestId: socket.data.requestId ?? randomUUID(), userId: socket.data.userId },
      async () => {
        const started = performance.now();
        const roomsToLeave = new Set<string>(this.connections.getRoomSubscriptions(socket.id));
        for (const room of socket.rooms) {
          if (room !== socket.id) {
            roomsToLeave.add(room);
          }
        }
        await Promise.all([...roomsToLeave].map((roomId) => Promise.resolve(socket.leave(roomId))));

        this.connections.removeConnection(socket.id);
        try {
          await this.presence.disconnect(socket.data.userId, socket.id);
        } catch (error: unknown) {
          this.logger.error('presence.disconnect_failed', {
            error: error instanceof Error ? error : { message: String(error) },
          });
        }
        this.logger.log('ws.disconnect', {
          event: 'disconnection',
          duration: Math.round(performance.now() - started),
        });
      },
    );
  }

  @SubscribeMessage(CLIENT_SOCKET_EVENTS.ROOM_JOIN)
  async handleRoomJoin(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: unknown,
  ): Promise<void> {
    await this.executeWithValidation(socket, CLIENT_SOCKET_EVENTS.ROOM_JOIN, payload, () =>
      this.roomSubscriptions.joinRoom(socket, payload as { roomId: string }),
    );
  }

  @SubscribeMessage(CLIENT_SOCKET_EVENTS.ROOM_LEAVE)
  async handleRoomLeave(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: unknown,
  ): Promise<void> {
    await this.executeWithValidation(socket, CLIENT_SOCKET_EVENTS.ROOM_LEAVE, payload, () =>
      this.roomSubscriptions.leaveRoom(socket, payload as { roomId: string }),
    );
  }

  @SubscribeMessage(CLIENT_SOCKET_EVENTS.MESSAGE_SEND)
  async handleMessageSend(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: unknown,
  ): Promise<void> {
    await this.executeWithValidation(socket, CLIENT_SOCKET_EVENTS.MESSAGE_SEND, payload, () =>
      this.messages.sendMessage(
        socket,
        payload as { roomId: string; content: string; clientMessageId: string },
      ),
    );
  }

  @SubscribeMessage(CLIENT_SOCKET_EVENTS.TYPING_START)
  async handleTypingStart(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: unknown,
  ): Promise<void> {
    await this.executeWithValidation(
      socket,
      CLIENT_SOCKET_EVENTS.TYPING_START,
      payload,
      () => this.typing.relayTypingStart(socket, payload as { roomId: string }),
      { logSuccess: false },
    );
  }

  @SubscribeMessage(CLIENT_SOCKET_EVENTS.TYPING_STOP)
  async handleTypingStop(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: unknown,
  ): Promise<void> {
    await this.executeWithValidation(
      socket,
      CLIENT_SOCKET_EVENTS.TYPING_STOP,
      payload,
      () => this.typing.relayTypingStop(socket, payload as { roomId: string }),
      { logSuccess: false },
    );
  }

  private async executeWithValidation(
    socket: AuthenticatedSocket,
    event: string,
    payload: unknown,
    action: () => Promise<void>,
    options: { readonly logSuccess?: boolean } = {},
  ): Promise<void> {
    const started = performance.now();
    const correlation = socketPayloadCorrelation(payload);
    const logSuccess = options.logSuccess !== false;

    await this.requestContext.run(
      {
        requestId: randomUUID(),
        userId: socket.data.userId,
        ...correlation,
      },
      async () => {
        try {
          await action();
          if (logSuccess) {
            this.logger.log('ws.event', {
              event,
              duration: Math.round(performance.now() - started),
            });
          }
        } catch (error) {
          const duration = Math.round(performance.now() - started);

          if (error instanceof ZodError) {
            this.logger.warn('ws.event_failed', {
              event,
              duration,
              code: API_ERROR_CODES.VALIDATION_FAILED,
            });
            socket.emit(SERVER_SOCKET_EVENTS.ERROR, {
              code: API_ERROR_CODES.VALIDATION_FAILED,
              message: error.issues.map((issue) => issue.message).join('; '),
            });
            return;
          }

          if (error instanceof ApiException) {
            const response = error.getResponse() as { code?: string; message?: string };
            const code = response.code ?? API_ERROR_CODES.INTERNAL_ERROR;
            this.logger.warn('ws.event_failed', { event, duration, code });
            socket.emit(SERVER_SOCKET_EVENTS.ERROR, {
              code,
              message: response.message ?? 'An unexpected error occurred.',
            });
            return;
          }

          this.logger.error('ws.event_failed', {
            event,
            duration,
            error: error instanceof Error ? error : { message: String(error) },
          });
          socket.emit(SERVER_SOCKET_EVENTS.ERROR, {
            code: API_ERROR_CODES.INTERNAL_ERROR,
            message: 'An unexpected error occurred.',
          });
        }
      },
    );
  }

  private async cleanupStaleSockets(connectingSocketId: string): Promise<void> {
    const stale = this.connections.removeStaleConnections(
      (socketId) => socketId === connectingSocketId || this.isSocketLive(socketId),
    );

    for (const record of stale) {
      try {
        await this.presence.disconnect(record.userId, record.socketId);
      } catch (error: unknown) {
        this.logger.error('presence.stale_disconnect_failed', {
          error: error instanceof Error ? error : { message: String(error) },
        });
      }
    }
  }

  private isSocketLive(socketId: string): boolean {
    return this.server?.sockets.sockets.has(socketId) === true;
  }
}
