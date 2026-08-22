import { useEffect, useMemo, useState } from 'react';

import { selectTypingUserIds, useRoomTypingStore } from '../store/room-typing-store';

/** Live list of user ids currently typing in a room (excluding the current user). */
export function useRoomTypingUsers(
  roomId: string | undefined,
  currentUserId: string | undefined,
): readonly string[] {
  const roomExpires = useRoomTypingStore((state) =>
    roomId === undefined || roomId.length === 0 ? undefined : state.expiresByRoom[roomId],
  );
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (roomId === undefined || roomId.length === 0) {
      return;
    }

    const interval = globalThis.setInterval(() => {
      setTick((value) => value + 1);
    }, 400);

    return () => {
      globalThis.clearInterval(interval);
    };
  }, [roomId]);

  return useMemo(() => {
    void tick;
    if (roomId === undefined || roomId.length === 0) {
      return [];
    }

    void roomExpires;
    return selectTypingUserIds(roomId, currentUserId);
  }, [roomId, currentUserId, roomExpires, tick]);
}
