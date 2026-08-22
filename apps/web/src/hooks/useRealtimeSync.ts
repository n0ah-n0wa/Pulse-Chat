import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { bindRealtimeQueryClient, startRealtimeSync } from '../services/realtime-sync-service';
import { useAuthStore } from '../store/auth-store';
import { setRealtimeCurrentUserId } from '../lib/realtime-sync-context';

/** Binds React Query and starts the singleton realtime → cache sync bridge. */
export function useRealtimeSync(): void {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id);

  useEffect(() => {
    setRealtimeCurrentUserId(userId ?? undefined);
  }, [userId]);

  useEffect(() => {
    bindRealtimeQueryClient(queryClient);
  }, [queryClient]);

  useEffect(() => startRealtimeSync(), []);
}
