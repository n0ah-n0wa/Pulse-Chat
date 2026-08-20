import type { NotificationType } from './notification-types.js';

/** Single notification returned by the REST API. */
export interface NotificationResponse {
  readonly id: string;
  readonly userId: string;
  readonly type: NotificationType;
  /** The room, message, or other entity this notification concerns. */
  readonly referenceId: string;
  readonly actorId: string;
  readonly isRead: boolean;
  readonly createdAt: string;
}

/** Cursor-paginated notification list. */
export interface NotificationListResponse {
  readonly items: readonly NotificationResponse[];
  readonly nextCursor?: string;
}
