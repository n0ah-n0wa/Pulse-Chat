import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { ZodError } from 'zod';

import { API_ERROR_CODES, CLIENT_SOCKET_EVENTS, SERVER_SOCKET_EVENTS } from '@pulse-chat/shared';

import { ApiException } from '../common/errors/api.exception.js';
import { NestStructuredLoggerService } from '../infrastructure/logging/nest-structured-logger.service.js';
import { PresenceService } from '../presence/presence.service.js';
import { userSocketRoom } from './bus/realtime-bus.channels.js';
import { RealtimeAuthenticationService } from './realtime-authentication.service.js';
import { RealtimeConnectionStateService } from './realtime-connection-state.service.js';
import { RealtimeMessageBroadcastService } from './realtime-message-broadcast.service.js';
import { RealtimeMessagesService } from './realtime-messages.service.js';
import { RealtimeRoomSubscriptionsService } from './realtime-room-subscriptions.service.js';
import type { AuthenticatedSocket } from './realtime.types.js';
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
  constructor(
    private readonly authentication: RealtimeAuthenticationService,
    private readonly connections: RealtimeConnectionStateService,
    private readonly roomSubscriptions: RealtimeRoomSubscriptionsService,
    private readonly messages: RealtimeMessagesService,
    private readonly messageBroadcast: RealtimeMessageBroadcastService,
    private readonly presence: PresenceService,
    private readonly logger: NestStructuredLoggerService,
  ) {}

  afterInit(server: Server): void {
    this.messageBroadcast.attachServer(server);
    server.use((socket, next) => {
      try {
        const authenticated = this.authentication.authenticateSocket(socket as AuthenticatedSocket);
        (socket as AuthenticatedSocket).data = authenticated;
        next();
      } catch (error) {
        next(error as Error);
      }
    });
  }

  async handleConnection(socket: AuthenticatedSocket): Promise<void> {
    this.connections.registerConnection(socket.id, socket.data.userId);
    await socket.join(userSocketRoom(socket.data.userId));
    try {
      await this.presence.connect(socket.data.userId, socket.id);
    } catch (error: unknown) {
      this.logger.error(
        'Failed to register presence for socket connection',
        error instanceof Error ? error.stack : undefined,
        RealtimeGateway.name,
      );
    }
  }

  async handleDisconnect(socket: AuthenticatedSocket): Promise<void> {
    for (const room of socket.rooms) {
      if (room !== socket.id) {
        await socket.leave(room);
      }
    }
    this.connections.removeConnection(socket.id);
    try {
      await this.presence.disconnect(socket.data.userId, socket.id);
    } catch (error: unknown) {
      this.logger.error(
        'Failed to clear presence for socket disconnect',
        error instanceof Error ? error.stack : undefined,
        RealtimeGateway.name,
      );
    }
  }

  @SubscribeMessage(CLIENT_SOCKET_EVENTS.ROOM_JOIN)
  async handleRoomJoin(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: unknown,
  ): Promise<void> {
    await this.executeWithValidation(socket, () =>
      this.roomSubscriptions.joinRoom(socket, payload as { roomId: string }),
    );
  }

  @SubscribeMessage(CLIENT_SOCKET_EVENTS.ROOM_LEAVE)
  async handleRoomLeave(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: unknown,
  ): Promise<void> {
    await this.executeWithValidation(socket, () =>
      this.roomSubscriptions.leaveRoom(socket, payload as { roomId: string }),
    );
  }

  @SubscribeMessage(CLIENT_SOCKET_EVENTS.MESSAGE_SEND)
  async handleMessageSend(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: unknown,
  ): Promise<void> {
    await this.executeWithValidation(socket, () =>
      this.messages.sendMessage(
        socket,
        payload as { roomId: string; content: string; clientMessageId: string },
      ),
    );
  }

  private async executeWithValidation(
    socket: AuthenticatedSocket,
    action: () => Promise<void>,
  ): Promise<void> {
    try {
      await action();
    } catch (error) {
      if (error instanceof ZodError) {
        socket.emit(SERVER_SOCKET_EVENTS.ERROR, {
          code: API_ERROR_CODES.VALIDATION_FAILED,
          message: error.issues.map((issue) => issue.message).join('; '),
        });
        return;
      }

      if (error instanceof ApiException) {
        const response = error.getResponse() as { code?: string; message?: string };
        socket.emit(SERVER_SOCKET_EVENTS.ERROR, {
          code: response.code ?? API_ERROR_CODES.INTERNAL_ERROR,
          message: response.message ?? 'An unexpected error occurred.',
        });
        return;
      }

      socket.emit(SERVER_SOCKET_EVENTS.ERROR, {
        code: API_ERROR_CODES.INTERNAL_ERROR,
        message: 'An unexpected error occurred.',
      });
    }
  }
}
