import { TYPING_TIMEOUT_MS } from '@pulse-chat/shared';
import { create } from 'zustand';

interface TypingPayload {
  readonly roomId: string;
  readonly userId: string;
}

interface RoomTypingState {
  /** roomId → userId → expiry timestamp (ms) */
  readonly expiresByRoom: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly applyTypingStarted: (payload: TypingPayload) => void;
  readonly applyTypingStopped: (payload: TypingPayload) => void;
  readonly clearRoom: (roomId: string) => void;
  readonly reset: () => void;
}

export const useRoomTypingStore = create<RoomTypingState>((set) => ({
  expiresByRoom: {},
  applyTypingStarted: (payload) => {
    const expiresAt = Date.now() + TYPING_TIMEOUT_MS;
    set((state) => {
      const room = state.expiresByRoom[payload.roomId] ?? {};
      return {
        expiresByRoom: {
          ...state.expiresByRoom,
          [payload.roomId]: {
            ...room,
            [payload.userId]: expiresAt,
          },
        },
      };
    });
  },
  applyTypingStopped: (payload) => {
    set((state) => {
      const room = state.expiresByRoom[payload.roomId];
      if (room?.[payload.userId] === undefined) {
        return state;
      }

      const { [payload.userId]: _removed, ...rest } = room;
      const nextRooms = { ...state.expiresByRoom };
      if (Object.keys(rest).length === 0) {
        delete nextRooms[payload.roomId];
      } else {
        nextRooms[payload.roomId] = rest;
      }

      return { expiresByRoom: nextRooms };
    });
  },
  clearRoom: (roomId) => {
    set((state) => {
      if (state.expiresByRoom[roomId] === undefined) {
        return state;
      }

      const next = { ...state.expiresByRoom };
      delete next[roomId];
      return { expiresByRoom: next };
    });
  },
  reset: () => {
    set({ expiresByRoom: {} });
  },
}));

export function applyTypingStarted(payload: TypingPayload): void {
  useRoomTypingStore.getState().applyTypingStarted(payload);
}

export function applyTypingStopped(payload: TypingPayload): void {
  useRoomTypingStore.getState().applyTypingStopped(payload);
}

export function selectTypingUserIds(
  roomId: string,
  excludeUserId: string | undefined,
): readonly string[] {
  const now = Date.now();
  const room = useRoomTypingStore.getState().expiresByRoom[roomId];
  if (room === undefined) {
    return [];
  }

  return Object.entries(room)
    .filter(([userId, expiresAt]) => expiresAt > now && userId !== excludeUserId)
    .map(([userId]) => userId);
}
