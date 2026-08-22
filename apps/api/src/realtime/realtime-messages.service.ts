import { Injectable } from '@nestjs/common';

import { messageSendEventSchema, type MessageSendEventInput } from '@pulse-chat/shared';

import { MessagesService } from '../messages/messages.service.js';
import { RATE_LIMIT_ACTIONS } from '../rate-limit/rate-limit.keys.js';
import { RateLimitService } from '../rate-limit/rate-limit.service.js';
import { RealtimeMessageBroadcastService } from './realtime-message-broadcast.service.js';
import type { AuthenticatedSocket } from './realtime.types.js';

@Injectable()
export class RealtimeMessagesService {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly broadcast: RealtimeMessageBroadcastService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async sendMessage(socket: AuthenticatedSocket, payload: MessageSendEventInput): Promise<void> {
    const validated = messageSendEventSchema.parse(payload);
    await this.rateLimit.consume(RATE_LIMIT_ACTIONS.MESSAGES, socket.data.userId);
    const { message, created } = await this.messagesService.createMessage(
      socket.data.userId,
      validated.roomId,
      {
        content: validated.content,
        clientMessageId: validated.clientMessageId,
        replyToMessageId: validated.replyToMessageId,
      },
    );

    if (created) {
      await this.broadcast.broadcastNew(validated.roomId, message);
    }
  }
}
