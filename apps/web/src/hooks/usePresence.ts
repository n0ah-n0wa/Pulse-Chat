import { usePresenceStore } from '../store/presence-store';

export function useIsUserOnline(userId: string | undefined): boolean {
  return usePresenceStore((state) =>
    userId === undefined ? false : state.onlineUserIds.has(userId),
  );
}

export function useOnlineUserIds(): ReadonlySet<string> {
  return usePresenceStore((state) => state.onlineUserIds);
}
