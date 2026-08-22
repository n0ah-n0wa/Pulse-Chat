import { Inject, Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

import {
  SERVER_SOCKET_EVENTS,
  type MessageDeletedEvent,
  type MessageNewEvent,
  type MessageResponse,
  type MessageUpdatedEvent,
  type NotificationNewEvent,
  type ReactionChangedEvent,
  type TypingStartedEvent,
  type TypingStoppedEvent,
  type UserOfflineEvent,
  type UserOnlineEvent,
} from '@pulse-chat/shared';

import { NestStructuredLoggerService } from '../infrastructure/logging/nest-structured-logger.service.js';
import type { PresenceNotifier } from '../presence/presence.store.interface.js';
import { DISTRIBUTED_REALTIME_EVENTS, userSocketRoom } from './bus/realtime-bus.channels.js';
import type { RealtimeBusEnvelope } from './bus/realtime-bus.envelope.js';
import { REALTIME_EVENT_PUBLISHER, REALTIME_EVENT_SUBSCRIBER } from './bus/realtime-bus.tokens.js';
import type { RealtimeEventPublisher } from './bus/realtime-event-publisher.interface.js';
import type { RealtimeEventSubscriber } from './bus/realtime-event-subscriber.interface.js';
import { RealtimeConnectionStateService } from './realtime-connection-state.service.js';
import type { AuthenticatedSocket } from './realtime.types.js';

@Injectable()
export class RealtimeMessageBroadcastService implements PresenceNotifier {
  private server: Server | undefined;

  constructor(
    @Inject(REALTIME_EVENT_PUBLISHER) private readonly publisher: RealtimeEventPublisher,
    @Inject(REALTIME_EVENT_SUBSCRIBER) subscriber: RealtimeEventSubscriber,
    private readonly logger: NestStructuredLoggerService,
    private readonly connections: RealtimeConnectionStateService,
  ) {
    subscriber.onEvent((event) => {
      this.applyRemote(event);
    });
  }

  attachServer(server: Server): void {
    this.server = server;
  }

  broadcastNew(roomId: string, message: MessageResponse): Promise<void> {
    const payload: MessageNewEvent = { message };
    this.emitToRoom(roomId, SERVER_SOCKET_EVENTS.MESSAGE_NEW, payload);
    return this.publish({
      event: DISTRIBUTED_REALTIME_EVENTS.MESSAGE_NEW,
      roomId,
      payload,
    });
  }

  broadcastUpdated(roomId: string, message: MessageResponse): Promise<void> {
    const payload: MessageUpdatedEvent = { message };
    this.emitToRoom(roomId, SERVER_SOCKET_EVENTS.MESSAGE_UPDATED, payload);
    return this.publish({
      event: DISTRIBUTED_REALTIME_EVENTS.MESSAGE_UPDATED,
      roomId,
      payload,
    });
  }

  broadcastDeleted(roomId: string, message: MessageResponse): Promise<void> {
    const payload: MessageDeletedEvent = { message };
    this.emitToRoom(roomId, SERVER_SOCKET_EVENTS.MESSAGE_DELETED, payload);
    return this.publish({
      event: DISTRIBUTED_REALTIME_EVENTS.MESSAGE_DELETED,
      roomId,
      payload,
    });
  }

  broadcastReactionAdded(event: ReactionChangedEvent): Promise<void> {
    this.emitToRoom(event.roomId, SERVER_SOCKET_EVENTS.REACTION_ADDED, event);
    return this.publish({
      event: DISTRIBUTED_REALTIME_EVENTS.REACTION_ADDED,
      roomId: event.roomId,
      userId: event.userId,
      payload: event,
    });
  }

  broadcastReactionRemoved(event: ReactionChangedEvent): Promise<void> {
    this.emitToRoom(event.roomId, SERVER_SOCKET_EVENTS.REACTION_REMOVED, event);
    return this.publish({
      event: DISTRIBUTED_REALTIME_EVENTS.REACTION_REMOVED,
      roomId: event.roomId,
      userId: event.userId,
      payload: event,
    });
  }

  notifyOnline(event: UserOnlineEvent): Promise<void> {
    this.server?.emit(SERVER_SOCKET_EVENTS.USER_ONLINE, event);
    return this.publish({
      event: DISTRIBUTED_REALTIME_EVENTS.USER_ONLINE,
      userId: event.userId,
      payload: event,
    });
  }

  notifyOffline(event: UserOfflineEvent): Promise<void> {
    this.server?.emit(SERVER_SOCKET_EVENTS.USER_OFFLINE, event);
    return this.publish({
      event: DISTRIBUTED_REALTIME_EVENTS.USER_OFFLINE,
      userId: event.userId,
      payload: event,
    });
  }

  broadcastNotification(event: NotificationNewEvent): Promise<void> {
    this.server
      ?.to(userSocketRoom(event.notification.userId))
      .emit(SERVER_SOCKET_EVENTS.NOTIFICATION_NEW, event);
    return this.publish({
      event: DISTRIBUTED_REALTIME_EVENTS.NOTIFICATION_NEW,
      userId: event.notification.userId,
      payload: event,
    });
  }

  broadcastTypingStarted(event: TypingStartedEvent, origin: AuthenticatedSocket): Promise<void> {
    origin.to(event.roomId).emit(SERVER_SOCKET_EVENTS.TYPING_STARTED, event);
    return this.publish({
      event: DISTRIBUTED_REALTIME_EVENTS.TYPING_STARTED,
      roomId: event.roomId,
      userId: event.userId,
      payload: event,
    });
  }

  broadcastTypingStopped(event: TypingStoppedEvent, origin: AuthenticatedSocket): Promise<void> {
    origin.to(event.roomId).emit(SERVER_SOCKET_EVENTS.TYPING_STOPPED, event);
    return this.publish({
      event: DISTRIBUTED_REALTIME_EVENTS.TYPING_STOPPED,
      roomId: event.roomId,
      userId: event.userId,
      payload: event,
    });
  }

  evictMemberFromRoom(roomId: string, userId: string): Promise<void> {
    this.evictMemberFromRoomLocal(roomId, userId);
    return this.publish({
      event: DISTRIBUTED_REALTIME_EVENTS.MEMBER_REMOVED,
      roomId,
      userId,
      payload: { roomId, userId },
    });
  }

  private applyRemote(envelope: RealtimeBusEnvelope): void {
    switch (envelope.event) {
      case DISTRIBUTED_REALTIME_EVENTS.MESSAGE_NEW:
        this.emitToRoom(envelope.roomId, SERVER_SOCKET_EVENTS.MESSAGE_NEW, envelope.payload);
        return;
      case DISTRIBUTED_REALTIME_EVENTS.MESSAGE_UPDATED:
        this.emitToRoom(envelope.roomId, SERVER_SOCKET_EVENTS.MESSAGE_UPDATED, envelope.payload);
        return;
      case DISTRIBUTED_REALTIME_EVENTS.MESSAGE_DELETED:
        this.emitToRoom(envelope.roomId, SERVER_SOCKET_EVENTS.MESSAGE_DELETED, envelope.payload);
        return;
      case DISTRIBUTED_REALTIME_EVENTS.REACTION_ADDED:
        this.emitToRoom(envelope.roomId, SERVER_SOCKET_EVENTS.REACTION_ADDED, envelope.payload);
        return;
      case DISTRIBUTED_REALTIME_EVENTS.REACTION_REMOVED:
        this.emitToRoom(envelope.roomId, SERVER_SOCKET_EVENTS.REACTION_REMOVED, envelope.payload);
        return;
      case DISTRIBUTED_REALTIME_EVENTS.USER_ONLINE:
        this.emitToAll(SERVER_SOCKET_EVENTS.USER_ONLINE, envelope.payload);
        return;
      case DISTRIBUTED_REALTIME_EVENTS.USER_OFFLINE:
        this.emitToAll(SERVER_SOCKET_EVENTS.USER_OFFLINE, envelope.payload);
        return;
      case DISTRIBUTED_REALTIME_EVENTS.NOTIFICATION_NEW: {
        if (envelope.userId === undefined) {
          return;
        }

        this.server
          ?.to(userSocketRoom(envelope.userId))
          .emit(SERVER_SOCKET_EVENTS.NOTIFICATION_NEW, envelope.payload);
        return;
      }
      case DISTRIBUTED_REALTIME_EVENTS.TYPING_STARTED:
        this.emitToRoom(envelope.roomId, SERVER_SOCKET_EVENTS.TYPING_STARTED, envelope.payload);
        return;
      case DISTRIBUTED_REALTIME_EVENTS.TYPING_STOPPED:
        this.emitToRoom(envelope.roomId, SERVER_SOCKET_EVENTS.TYPING_STOPPED, envelope.payload);
        return;
      case DISTRIBUTED_REALTIME_EVENTS.MEMBER_REMOVED: {
        if (envelope.roomId === undefined || envelope.userId === undefined) {
          return;
        }

        this.evictMemberFromRoomLocal(envelope.roomId, envelope.userId);
        return;
      }
      default:
        return;
    }
  }

  private evictMemberFromRoomLocal(roomId: string, userId: string): void {
    const server = this.server;
    if (server === undefined) {
      return;
    }

    for (const raw of server.sockets.sockets.values()) {
      const socket = raw as AuthenticatedSocket;
      if (socket.data.userId !== userId) {
        continue;
      }

      void socket.leave(roomId);
      socket.emit(SERVER_SOCKET_EVENTS.ROOM_LEFT, { roomId });
    }

    this.connections.removeRoomSubscriptionsForUser(userId, roomId);
  }

  private emitToRoom(roomId: string | undefined, event: string, payload: unknown): void {
    if (roomId === undefined) {
      return;
    }

    this.server?.to(roomId).emit(event, payload);
  }

  private emitToAll(event: string, payload: unknown): void {
    this.server?.emit(event, payload);
  }

  private async publish(event: Parameters<RealtimeEventPublisher['publish']>[0]): Promise<void> {
    try {
      await this.publisher.publish(event);
    } catch (error: unknown) {
      this.logger.error(
        'Failed to publish realtime event to the distributed bus',
        error instanceof Error ? error.stack : undefined,
        RealtimeMessageBroadcastService.name,
      );
    }
  }
}
