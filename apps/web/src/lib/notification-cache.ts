import type { NotificationListResponse, NotificationResponse } from '@pulse-chat/shared';

export function prependNotification(
  current: NotificationListResponse | undefined,
  notification: NotificationResponse,
): NotificationListResponse {
  if (current === undefined) {
    return { items: [notification] };
  }

  const withoutDuplicate = current.items.filter((item) => item.id !== notification.id);
  return {
    ...current,
    items: [notification, ...withoutDuplicate],
  };
}

export function patchNotificationReadState(
  current: NotificationListResponse | undefined,
  updated: NotificationResponse,
): NotificationListResponse | undefined {
  if (current === undefined) {
    return { items: [updated] };
  }

  return {
    ...current,
    items: current.items.map((item) => (item.id === updated.id ? updated : item)),
  };
}
