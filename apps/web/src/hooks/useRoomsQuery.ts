import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '../lib/query-keys';
import { roomsService } from '../services/rooms-service';
import { useAuthStore } from '../store/auth-store';

export function useRoomsQuery() {
  const accessToken = useAuthStore((state) => state.accessToken);

  return useQuery({
    queryKey: queryKeys.rooms.list(),
    queryFn: () => roomsService.list(),
    enabled: accessToken !== null,
  });
}

export function useRoomQuery(roomId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.rooms.detail(roomId ?? ''),
    queryFn: () => roomsService.get(roomId ?? ''),
    enabled: roomId !== undefined && roomId.length > 0,
  });
}
