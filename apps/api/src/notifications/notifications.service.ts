import { HttpStatus, Inject, Injectable } from '@nestjs/common';

import {
  NOTIFICATION_ERROR_CODES,
  NOTIFICATION_PAGE_SIZE_DEFAULT,
  NOTIFICATION_TYPES,
  type ListNotificationsQuery,
  type NotificationListResponse,
  type NotificationResponse,
  type NotificationType,
} from '@pulse-chat/shared';

import { ApiException } from '../common/errors/api.exception.js';
import { isValidObjectId } from '../common/validation/is-valid-object-id.js';
import { RealtimeMessageBroadcastService } from '../realtime/realtime-message-broadcast.service.js';
import { toNotificationListResponse, toNotificationResponse } from './notification.mapper.js';
import type {
  CreateNotificationInput,
  NotificationRecord,
  NotificationRepository,
} from './notification.repository.interface.js';
import { NOTIFICATION_REPOSITORY } from './notifications.tokens.js';

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY) private readonly notifications: NotificationRepository,
    private readonly broadcast: RealtimeMessageBroadcastService,
  ) {}

  /**
   * Creates a notification (idempotent per unique tuple) and, when a new
   * record was persisted, delivers it in real-time to the recipient's sockets.
   */
  async notify(input: CreateNotificationInput): Promise<NotificationRecord> {
    const { record, created } = await this.notifications.findOrCreate(input);

    if (created) {
      await this.broadcast.broadcastNotification({
        notification: toNotificationResponse(record),
      });
    }

    return record;
  }

  async listNotifications(
    userId: string,
    query: ListNotificationsQuery,
  ): Promise<NotificationListResponse> {
    const limit = query.limit ?? NOTIFICATION_PAGE_SIZE_DEFAULT;
    const before = await this.resolveCursor(userId, query.before);

    const records = await this.notifications.findPage({
      userId,
      limit: limit + 1,
      before,
    });

    const hasMore = records.length > limit;
    return toNotificationListResponse(hasMore ? records.slice(0, limit) : records, hasMore);
  }

  async markRead(notificationId: string, userId: string): Promise<NotificationResponse> {
    if (!isValidObjectId(notificationId)) {
      this.throwNotFound();
    }

    const record = await this.notifications.markRead(notificationId, userId);
    if (record === null) {
      this.throwNotFound();
    }

    return toNotificationResponse(record);
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notifications.markAllRead(userId);
  }

  // ---------------------------------------------------------------------------
  // Convenience helpers called by other services
  // ---------------------------------------------------------------------------

  async notifyMention(
    actorId: string,
    recipientId: string,
    messageId: string,
    roomId: string,
  ): Promise<void> {
    if (actorId === recipientId) {
      return;
    }

    await this.notify({
      userId: recipientId,
      type: NOTIFICATION_TYPES.MENTION,
      referenceId: messageId,
      roomId,
      actorId,
    });
  }

  async notifyReply(
    actorId: string,
    originalAuthorId: string,
    messageId: string,
    roomId: string,
  ): Promise<void> {
    if (actorId === originalAuthorId) {
      return;
    }

    await this.notify({
      userId: originalAuthorId,
      type: NOTIFICATION_TYPES.REPLY,
      referenceId: messageId,
      roomId,
      actorId,
    });
  }

  async notifyDirectMessage(
    actorId: string,
    recipientId: string,
    messageId: string,
    roomId: string,
  ): Promise<void> {
    if (actorId === recipientId) {
      return;
    }

    await this.notify({
      userId: recipientId,
      type: NOTIFICATION_TYPES.DIRECT_MESSAGE,
      referenceId: messageId,
      roomId,
      actorId,
    });
  }

  async notifyRoomInvitation(actorId: string, recipientId: string, roomId: string): Promise<void> {
    if (actorId === recipientId) {
      return;
    }

    await this.notify({
      userId: recipientId,
      type: NOTIFICATION_TYPES.ROOM_INVITATION,
      referenceId: roomId,
      roomId,
      actorId,
    });
  }

  private async resolveCursor(
    userId: string,
    before: string | undefined,
  ): Promise<{ createdAt: Date; id: string } | undefined> {
    if (before === undefined) {
      return undefined;
    }

    const record = await this.notifications.findById(before);
    if (record?.userId !== userId) {
      throw new ApiException(
        NOTIFICATION_ERROR_CODES.NOTIFICATION_NOT_FOUND,
        'Notification cursor is invalid.',
        HttpStatus.BAD_REQUEST,
      );
    }

    return { createdAt: record.createdAt, id: record.id };
  }

  private throwNotFound(): never {
    throw new ApiException(
      NOTIFICATION_ERROR_CODES.NOTIFICATION_NOT_FOUND,
      'Notification not found.',
      HttpStatus.NOT_FOUND,
    );
  }
}

export function notificationTypeFromString(value: string): NotificationType | undefined {
  return Object.values(NOTIFICATION_TYPES).includes(value as NotificationType)
    ? (value as NotificationType)
    : undefined;
}
