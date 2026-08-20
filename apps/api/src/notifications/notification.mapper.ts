import type { NotificationListResponse, NotificationResponse } from '@pulse-chat/shared';

import type { NotificationRecord } from './notification.repository.interface.js';

export function toNotificationResponse(record: NotificationRecord): NotificationResponse {
  return {
    id: record.id,
    userId: record.userId,
    type: record.type,
    referenceId: record.referenceId,
    actorId: record.actorId,
    isRead: record.isRead,
    createdAt: record.createdAt.toISOString(),
  };
}

export function toNotificationListResponse(
  records: readonly NotificationRecord[],
  hasMore: boolean,
): NotificationListResponse {
  const items = records.map(toNotificationResponse);
  const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
  return { items, nextCursor };
}
