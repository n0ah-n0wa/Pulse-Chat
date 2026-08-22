export function formatLastSeen(iso: string | undefined): string {
  if (iso === undefined || iso.length === 0) {
    return 'Last seen unknown';
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return 'Last seen unknown';
  }

  return `Last seen ${new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)}`;
}

export function presenceLabel(isOnline: boolean, lastSeenAt: string | undefined): string {
  return isOnline ? 'Online' : formatLastSeen(lastSeenAt);
}
