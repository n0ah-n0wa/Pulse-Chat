import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '../lib/query-keys';
import { usersService } from '../services/users-service';

export function usePublicProfileByUsername(username: string | undefined) {
  return useQuery({
    queryKey: queryKeys.users.byUsername(username ?? ''),
    queryFn: () => usersService.getPublicProfileByUsername(username ?? ''),
    enabled: username !== undefined && username.length > 0,
    staleTime: 30_000,
  });
}
