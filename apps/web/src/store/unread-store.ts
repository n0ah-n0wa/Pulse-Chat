import { create } from 'zustand';

/** Tracks unread increments for rooms while realtime events arrive off-page. */
interface UnreadState {
  readonly increments: Readonly<Record<string, number>>;
  readonly increment: (roomId: string) => void;
  readonly clear: (roomId: string) => void;
  readonly reset: () => void;
}

export const useUnreadStore = create<UnreadState>((set) => ({
  increments: {},
  increment: (roomId) => {
    set((state) => ({
      increments: {
        ...state.increments,
        [roomId]: (state.increments[roomId] ?? 0) + 1,
      },
    }));
  },
  clear: (roomId) => {
    set((state) => {
      if (state.increments[roomId] === undefined) {
        return state;
      }
      const next = { ...state.increments };
      delete next[roomId];
      return { increments: next };
    });
  },
  reset: () => {
    set({ increments: {} });
  },
}));
