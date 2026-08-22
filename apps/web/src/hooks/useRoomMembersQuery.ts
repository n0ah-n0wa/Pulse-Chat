import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '../lib/query-keys';
import { roomsService } from '../services/rooms-service';

export function useRoomMembersQuery(roomId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.rooms.members(roomId ?? ''),
    queryFn: () => roomsService.listMembers(roomId ?? ''),
    enabled: roomId !== undefined && roomId.length > 0,
  });
}
