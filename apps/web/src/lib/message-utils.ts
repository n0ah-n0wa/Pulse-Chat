const GROUP_WINDOW_MS = 5 * 60 * 1000;

export function shouldGroupWithPrevious(
  previous: { readonly authorId: string; readonly createdAt: string; readonly deletedAt?: string },
  current: { readonly authorId: string; readonly createdAt: string; readonly deletedAt?: string },
): boolean {
  if (previous.deletedAt !== undefined || current.deletedAt !== undefined) {
    return false;
  }

  if (previous.authorId !== current.authorId) {
    return false;
  }

  const previousTime = Date.parse(previous.createdAt);
  const currentTime = Date.parse(current.createdAt);
  if (Number.isNaN(previousTime) || Number.isNaN(currentTime)) {
    return false;
  }

  return currentTime - previousTime <= GROUP_WINDOW_MS;
}

export function formatMessageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function formatMessageDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function createClientMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `client-${String(Date.now())}-${String(Math.random()).slice(2, 10)}`;
}

/** Deterministic placeholder id for optimistic cache rows (replaced by server id via clientMessageId). */
export function optimisticMessageIdForClient(clientMessageId: string): string {
  return `optimistic:${clientMessageId}`;
}

export function isOptimisticMessage(message: {
  readonly id: string;
  readonly clientMessageId: string;
}): boolean {
  return message.id === optimisticMessageIdForClient(message.clientMessageId);
}

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉'] as const;
