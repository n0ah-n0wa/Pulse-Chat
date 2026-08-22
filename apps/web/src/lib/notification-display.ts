import {
  NOTIFICATION_TYPES,
  type NotificationResponse,
  type NotificationType,
} from '@pulse-chat/shared';

const LABELS: Record<NotificationType, string> = {
  [NOTIFICATION_TYPES.MENTION]: 'Mention',
  [NOTIFICATION_TYPES.REPLY]: 'Reply',
  [NOTIFICATION_TYPES.DIRECT_MESSAGE]: 'Direct message',
  [NOTIFICATION_TYPES.ROOM_INVITATION]: 'Room invitation',
};

export function notificationTypeLabel(type: NotificationType): string {
  return LABELS[type];
}

export function notificationSummary(notification: NotificationResponse): string {
  return `${notificationTypeLabel(notification.type)} · ${new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(notification.createdAt))}`;
}

/** Path to the room or conversation this notification refers to. */
export function notificationRoomPath(notification: NotificationResponse): string | undefined {
  const roomId =
    notification.roomId ??
    (notification.type === NOTIFICATION_TYPES.ROOM_INVITATION
      ? notification.referenceId
      : undefined);

  if (roomId === undefined || roomId.length === 0) {
    return undefined;
  }

  return `/app/rooms/${roomId}`;
}
