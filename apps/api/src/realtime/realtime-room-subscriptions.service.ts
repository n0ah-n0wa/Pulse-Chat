import { Injectable } from '@nestjs/common';

import {
  SERVER_SOCKET_EVENTS,
  roomJoinEventSchema,
  roomLeaveEventSchema,
  type RoomJoinEventInput,
  type RoomLeaveEventInput,
} from '@pulse-chat/shared';

import { RoomsService } from '../rooms/rooms.service.js';
import { RealtimeConnectionStateService } from './realtime-connection-state.service.js';
import type { AuthenticatedSocket } from './realtime.types.js';

@Injectable()
export class RealtimeRoomSubscriptionsService {
  constructor(
    private readonly roomsService: RoomsService,
    private readonly connections: RealtimeConnectionStateService,
  ) {}

  async joinRoom(socket: AuthenticatedSocket, payload: RoomJoinEventInput): Promise<void> {
    const validated = roomJoinEventSchema.parse(payload);
    await this.roomsService.requireMember(socket.data.userId, validated.roomId);

    // Idempotent: if the socket is already subscribed, re-emit room:joined
    // with fresh room state so the client can resync, but skip the join side-
    // effects that would otherwise double-count the subscription.
    const alreadyJoined = this.connections
      .getRoomSubscriptions(socket.id)
      .includes(validated.roomId);

    if (!alreadyJoined) {
      await socket.join(validated.roomId);
      this.connections.addRoomSubscription(socket.id, validated.roomId);
    }

    const room = await this.roomsService.getRoom(socket.data.userId, validated.roomId);
    socket.emit(SERVER_SOCKET_EVENTS.ROOM_JOINED, { roomId: validated.roomId, room });
  }

  async leaveRoom(socket: AuthenticatedSocket, payload: RoomLeaveEventInput): Promise<void> {
    const validated = roomLeaveEventSchema.parse(payload);
    await socket.leave(validated.roomId);
    this.connections.removeRoomSubscription(socket.id, validated.roomId);
    socket.emit(SERVER_SOCKET_EVENTS.ROOM_LEFT, { roomId: validated.roomId });
  }
}
