import { useQuery } from '@tanstack/react-query';

import { normalizeDirectoryQuery } from '@pulse-chat/shared';

import { queryKeys } from '../lib/query-keys';
import { usersService } from '../services/users-service';
import { useAuthStore } from '../store/auth-store';
import { useDebouncedValue } from './useDebouncedValue';

const SEARCH_DEBOUNCE_MS = 300;

export function useUsersSearchQuery(query: string) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const debouncedQuery = useDebouncedValue(normalizeDirectoryQuery(query), SEARCH_DEBOUNCE_MS);

  return useQuery({
    queryKey: queryKeys.users.search(debouncedQuery),
    queryFn: () => usersService.search(debouncedQuery),
    enabled: accessToken !== null && debouncedQuery.length > 0,
  });
}
