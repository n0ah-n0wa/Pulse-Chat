import { Injectable } from '@nestjs/common';

import {
  SERVER_SOCKET_EVENTS,
  roomJoinEventSchema,
  roomLeaveEventSchema,
  type RoomJoinEventInput,
  type RoomLeaveEventInput,
} from '@pulse-chat/shared';

import { NestStructuredLoggerService } from '../infrastructure/logging/nest-structured-logger.service.js';
import { PresenceService } from '../presence/presence.service.js';
import { RoomsService } from '../rooms/rooms.service.js';
import { RealtimeConnectionStateService } from './realtime-connection-state.service.js';
import type { AuthenticatedSocket } from './realtime.types.js';

@Injectable()
export class RealtimeRoomSubscriptionsService {
  constructor(
    private readonly roomsService: RoomsService,
    private readonly connections: RealtimeConnectionStateService,
    private readonly presence: PresenceService,
    private readonly logger: NestStructuredLoggerService,
  ) {}

  async joinRoom(socket: AuthenticatedSocket, payload: RoomJoinEventInput): Promise<void> {
    const validated = roomJoinEventSchema.parse(payload);
    await this.roomsService.requireMember(socket.data.userId, validated.roomId);

    // Idempotent: if the socket is already subscribed, re-emit room:joined
    // with fresh room state so the client can resync, but skip the join side-
    // effects that would otherwise double-count the subscription.
    const alreadyJoined = socket.rooms.has(validated.roomId);

    if (!alreadyJoined) {
      await socket.join(validated.roomId);
      this.connections.addRoomSubscription(socket.id, validated.roomId);
    }

    const room = await this.roomsService.getRoom(socket.data.userId, validated.roomId);
    socket.emit(SERVER_SOCKET_EVENTS.ROOM_JOINED, { roomId: validated.roomId, room });
    await this.emitPresenceSnapshot(socket, validated.roomId);

    if (!alreadyJoined) {
      const presence = await this.presence.getPresence(socket.data.userId);
      if (presence !== null) {
        socket.to(validated.roomId).emit(SERVER_SOCKET_EVENTS.USER_ONLINE, {
          userId: socket.data.userId,
          lastSeenAt: presence.lastSeenAt.toISOString(),
        });
      }
    }
  }

  async leaveRoom(socket: AuthenticatedSocket, payload: RoomLeaveEventInput): Promise<void> {
    const validated = roomLeaveEventSchema.parse(payload);
    await socket.leave(validated.roomId);
    this.connections.removeRoomSubscription(socket.id, validated.roomId);
    socket.emit(SERVER_SOCKET_EVENTS.ROOM_LEFT, { roomId: validated.roomId });
  }

  /**
   * Pushes current online members to the joining socket so a reconnect can
   * rebuild presence without waiting for later user:online events.
   */
  private async emitPresenceSnapshot(socket: AuthenticatedSocket, roomId: string): Promise<void> {
    try {
      const members = await this.roomsService.listMembers(socket.data.userId, roomId);
      const otherUserIds = members
        .map((member) => member.userId)
        .filter((userId) => userId !== socket.data.userId);
      const snapshots = await this.presence.getPresenceMany(otherUserIds);

      for (const snapshot of snapshots.values()) {
        socket.emit(SERVER_SOCKET_EVENTS.USER_ONLINE, {
          userId: snapshot.userId,
          lastSeenAt: snapshot.lastSeenAt.toISOString(),
        });
      }
    } catch (error: unknown) {
      this.logger.warn(
        `Failed to emit presence snapshot for room ${roomId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
        RealtimeRoomSubscriptionsService.name,
      );
    }
  }
}
