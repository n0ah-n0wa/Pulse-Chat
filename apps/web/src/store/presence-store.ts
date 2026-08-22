import { create } from 'zustand';

interface PresenceState {
  readonly onlineUserIds: ReadonlySet<string>;
  readonly setUserOnline: (userId: string) => void;
  readonly setUserOffline: (userId: string) => void;
  readonly resetPresence: () => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  onlineUserIds: new Set<string>(),
  setUserOnline: (userId) => {
    set((state) => {
      const next = new Set(state.onlineUserIds);
      next.add(userId);
      return { onlineUserIds: next };
    });
  },
  setUserOffline: (userId) => {
    set((state) => {
      if (!state.onlineUserIds.has(userId)) {
        return state;
      }
      const next = new Set(state.onlineUserIds);
      next.delete(userId);
      return { onlineUserIds: next };
    });
  },
  resetPresence: () => {
    set({ onlineUserIds: new Set<string>() });
  },
}));

export function applyUserOnline(userId: string): void {
  usePresenceStore.getState().setUserOnline(userId);
}

export function applyUserOffline(userId: string): void {
  usePresenceStore.getState().setUserOffline(userId);
}

export function isUserOnline(userId: string): boolean {
  return usePresenceStore.getState().onlineUserIds.has(userId);
}
