import { Injectable } from '@nestjs/common';

import {
  typingRoomEventSchema,
  type TypingRoomEventInput,
  type TypingStartedEvent,
  type TypingStoppedEvent,
} from '@pulse-chat/shared';

import { RATE_LIMIT_ACTIONS } from '../rate-limit/rate-limit.keys.js';
import { RateLimitService } from '../rate-limit/rate-limit.service.js';
import { RoomsService } from '../rooms/rooms.service.js';
import { RealtimeMessageBroadcastService } from './realtime-message-broadcast.service.js';
import type { AuthenticatedSocket } from './realtime.types.js';

@Injectable()
export class RealtimeTypingService {
  constructor(
    private readonly roomsService: RoomsService,
    private readonly rateLimit: RateLimitService,
    private readonly broadcast: RealtimeMessageBroadcastService,
  ) {}

  async relayTypingStart(
    socket: AuthenticatedSocket,
    payload: TypingRoomEventInput,
  ): Promise<void> {
    const event = await this.authorizeTyping(socket, payload);
    await this.broadcast.broadcastTypingStarted(event, socket);
  }

  async relayTypingStop(socket: AuthenticatedSocket, payload: TypingRoomEventInput): Promise<void> {
    const event = await this.authorizeTyping(socket, payload);
    await this.broadcast.broadcastTypingStopped(event, socket);
  }

  private async authorizeTyping(
    socket: AuthenticatedSocket,
    payload: TypingRoomEventInput,
  ): Promise<TypingStartedEvent & TypingStoppedEvent> {
    const validated = typingRoomEventSchema.parse(payload);
    await this.roomsService.requireMember(socket.data.userId, validated.roomId);
    await this.rateLimit.consume(RATE_LIMIT_ACTIONS.TYPING, socket.data.userId);

    return {
      roomId: validated.roomId,
      userId: socket.data.userId,
    };
  }
}
