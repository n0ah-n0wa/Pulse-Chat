import { useEffect } from 'react';

import { getSocketService } from '../services/socket-service';
import { useRoomTypingStore } from '../store/room-typing-store';

/** Reference-counted Socket.IO room join/leave for the active chat view. */
export function useRoomSubscription(roomId: string | undefined): void {
  useEffect(() => {
    if (roomId === undefined || roomId.length === 0) {
      return;
    }

    return getSocketService().acquireRoom(roomId);
  }, [roomId]);

  useEffect(() => {
    if (roomId === undefined || roomId.length === 0) {
      return;
    }

    return () => {
      useRoomTypingStore.getState().clearRoom(roomId);
    };
  }, [roomId]);
}
