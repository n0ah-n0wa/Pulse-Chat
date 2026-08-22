import { useCallback, useEffect, useRef } from 'react';

import { CLIENT_SOCKET_EVENTS, TYPING_TIMEOUT_MS } from '@pulse-chat/shared';

import { getSocketService } from '../services/socket-service';
import { useSocketStore } from '../store/socket-store';

const TYPING_EMIT_DEBOUNCE_MS = 400;

/** Debounced typing:start / typing:stop emitter for the message composer. */
export function useTypingEmitter(
  roomId: string | undefined,
  enabled: boolean,
): {
  readonly notifyTyping: () => void;
  readonly stopTyping: () => void;
} {
  const isTypingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionState = useSocketStore((state) => state.connectionState);

  const canEmit =
    enabled &&
    roomId !== undefined &&
    roomId.length > 0 &&
    (connectionState === 'connected' || connectionState === 'reconnected');

  const emitStop = useCallback(() => {
    if (!canEmit || roomId === undefined || !isTypingRef.current) {
      return;
    }

    isTypingRef.current = false;
    try {
      getSocketService().emit(CLIENT_SOCKET_EVENTS.TYPING_STOP, { roomId });
    } catch {
      // Disconnected.
    }
  }, [canEmit, roomId]);

  const notifyTyping = useCallback(() => {
    if (!canEmit || roomId === undefined) {
      return;
    }

    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      if (!isTypingRef.current) {
        isTypingRef.current = true;
        try {
          getSocketService().emit(CLIENT_SOCKET_EVENTS.TYPING_START, { roomId });
        } catch {
          isTypingRef.current = false;
        }
      }

      if (stopRef.current !== null) {
        clearTimeout(stopRef.current);
      }

      stopRef.current = setTimeout(() => {
        stopRef.current = null;
        emitStop();
      }, TYPING_TIMEOUT_MS);
    }, TYPING_EMIT_DEBOUNCE_MS);
  }, [canEmit, emitStop, roomId]);

  const stopTyping = useCallback(() => {
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (stopRef.current !== null) {
      clearTimeout(stopRef.current);
      stopRef.current = null;
    }
    emitStop();
  }, [emitStop]);

  useEffect(() => {
    return () => {
      stopTyping();
    };
  }, [stopTyping]);

  return { notifyTyping, stopTyping };
}
