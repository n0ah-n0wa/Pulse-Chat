import { useEffect, useRef } from 'react';

import { useAuthStore } from '../store/auth-store';
import { useMarkRoomRead } from './useMarkRoomRead';

/** Trailing delay so a live room does not POST /read on every inbound message. */
export const MARK_ROOM_READ_DEBOUNCE_MS = 500;

function flushPendingRead(
  mutate: (input: { messageId: string }) => void,
  pending: string | undefined,
  lastMarkedRef: { current: string | undefined },
): void {
  if (pending === undefined || lastMarkedRef.current === pending) {
    return;
  }

  if (useAuthStore.getState().accessToken === null) {
    return;
  }

  lastMarkedRef.current = pending;
  mutate({ messageId: pending });
}

/** Persists read state when the user views the latest message in a room. */
export function useMarkRoomReadWhenViewing(
  roomId: string | undefined,
  latestMessageId: string | undefined,
  enabled: boolean,
): void {
  const markRead = useMarkRoomRead(roomId ?? '');
  const lastMarkedRef = useRef<string | undefined>(undefined);
  const pendingMessageIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    lastMarkedRef.current = undefined;
    const mutate = markRead.mutate;

    return () => {
      const pending = pendingMessageIdRef.current;
      pendingMessageIdRef.current = undefined;
      flushPendingRead(mutate, pending, lastMarkedRef);
    };
    // Capture mutate for this roomId only. Including `markRead` would reset the
    // cursor whenever the mutation object identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- room-scoped flush
  }, [roomId]);

  useEffect(() => {
    if (!enabled || roomId === undefined || latestMessageId === undefined) {
      return;
    }

    if (lastMarkedRef.current === latestMessageId) {
      return;
    }

    pendingMessageIdRef.current = latestMessageId;
    const timer = globalThis.setTimeout(() => {
      const pending = pendingMessageIdRef.current;
      pendingMessageIdRef.current = undefined;
      flushPendingRead(markRead.mutate, pending, lastMarkedRef);
    }, MARK_ROOM_READ_DEBOUNCE_MS);

    return () => {
      globalThis.clearTimeout(timer);
    };
    // Flushing here would fire on every `latestMessageId` change and defeat debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- trailing debounce
  }, [enabled, roomId, latestMessageId]);
}
