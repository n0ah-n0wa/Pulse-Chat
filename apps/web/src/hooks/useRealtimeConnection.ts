import { useEffect } from 'react';

import { getSocketService } from '../services/socket-service';
import { useAuthStore } from '../store/auth-store';

/** Keeps the realtime transport aligned with the current auth session. */
export function useRealtimeConnection(): void {
  const accessToken = useAuthStore((state) => state.accessToken);

  useEffect(() => {
    if (accessToken === null) {
      getSocketService().disconnect();
      return;
    }

    return getSocketService().acquireConnection(accessToken);
  }, [accessToken]);
}
