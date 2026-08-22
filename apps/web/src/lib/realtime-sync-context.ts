let currentUserId: string | undefined;

export function setRealtimeCurrentUserId(userId: string | undefined): void {
  currentUserId = userId;
}

export function getRealtimeCurrentUserId(): string | undefined {
  return currentUserId;
}
