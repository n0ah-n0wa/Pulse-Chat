import type { MessageResponse } from '@pulse-chat/shared';

/** Mongo ObjectIds are time-ordered; lexicographic compare matches chronological order. */
export function isMessageAfterCursor(
  messageId: string,
  lastReadMessageId: string | undefined,
): boolean {
  if (lastReadMessageId === undefined || lastReadMessageId.length === 0) {
    return true;
  }

  return messageId > lastReadMessageId;
}

export function countUnreadMessages(
  messages: readonly MessageResponse[],
  lastReadMessageId: string | undefined,
  extraUnread = 0,
): number {
  const fromCache = messages.reduce((count, message) => {
    if (message.deletedAt !== undefined) {
      return count;
    }
    return isMessageAfterCursor(message.id, lastReadMessageId) ? count + 1 : count;
  }, 0);

  return fromCache + extraUnread;
}

export function countUnreadNotifications(items: readonly { readonly isRead: boolean }[]): number {
  return items.reduce((count, item) => (item.isRead ? count : count + 1), 0);
}
