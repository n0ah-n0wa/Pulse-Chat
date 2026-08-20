import { Injectable } from '@nestjs/common';

import { messageSendEventSchema, type MessageSendEventInput } from '@pulse-chat/shared';

import { MessagesService } from '../messages/messages.service.js';
import { RealtimeMessageBroadcastService } from './realtime-message-broadcast.service.js';
import type { AuthenticatedSocket } from './realtime.types.js';

@Injectable()
export class RealtimeMessagesService {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly broadcast: RealtimeMessageBroadcastService,
  ) {}

  async sendMessage(socket: AuthenticatedSocket, payload: MessageSendEventInput): Promise<void> {
    const validated = messageSendEventSchema.parse(payload);
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
