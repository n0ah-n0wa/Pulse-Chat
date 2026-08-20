import { useEffect } from 'react';

import { getSocketService } from '../services/socket-service';
import { useAuthStore } from '../store/auth-store';

/** Keeps the realtime transport aligned with the current auth session. */
export function useRealtimeConnection(): void {
  const accessToken = useAuthStore((state) => state.accessToken);

  useEffect(() => {
    const socketService = getSocketService();

    if (accessToken !== null) {
      socketService.connect(accessToken);
    } else {
      socketService.disconnect();
    }

    return () => {
      socketService.disconnect();
    };
  }, [accessToken]);
}
