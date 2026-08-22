import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';

import type { PublicUserProfile } from '@pulse-chat/shared';

import { queryKeys } from '../lib/query-keys';
import { usersService } from '../services/users-service';

export function useAuthorProfiles(authorIds: readonly string[]) {
  const uniqueIds = useMemo(
    () => [...new Set(authorIds.filter((id) => id.length > 0))],
    [authorIds],
  );

  const results = useQueries({
    queries: uniqueIds.map((userId) => ({
      queryKey: queryKeys.users.profile(userId),
      queryFn: () => usersService.getPublicProfile(userId),
      staleTime: 60_000,
    })),
  });

  return useMemo(() => {
    const map = new Map<string, PublicUserProfile>();
    for (let index = 0; index < uniqueIds.length; index += 1) {
      const id = uniqueIds[index];
      const result = results[index];
      if (id !== undefined && result?.data !== undefined) {
        map.set(id, result.data);
      }
    }
    return map;
  }, [uniqueIds, results]);
}
