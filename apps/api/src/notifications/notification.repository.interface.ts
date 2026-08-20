import type { NotificationType } from '@pulse-chat/shared';

export interface NotificationRecord {
  readonly id: string;
  readonly userId: string;
  readonly type: NotificationType;
  /** The entity (message, room, etc.) this notification points to. */
  readonly referenceId: string;
  /** The user who triggered the notification. */
  readonly actorId: string;
  readonly isRead: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateNotificationInput {
  readonly userId: string;
  readonly type: NotificationType;
  readonly referenceId: string;
  readonly actorId: string;
}

export interface FindNotificationsPageOptions {
  readonly userId: string;
  readonly limit: number;
  readonly before?: { createdAt: Date; id: string };
}

export interface NotificationRepository {
  /**
   * Creates a notification only when one with the same (userId, type,
   * referenceId, actorId) combination does not already exist.
   * Returns the existing or newly created record.
   */
  findOrCreate(
    input: CreateNotificationInput,
  ): Promise<{ record: NotificationRecord; created: boolean }>;

  findPage(options: FindNotificationsPageOptions): Promise<NotificationRecord[]>;

  findById(id: string): Promise<NotificationRecord | null>;

  markRead(notificationId: string, userId: string): Promise<NotificationRecord | null>;

  markAllRead(userId: string): Promise<void>;
}
