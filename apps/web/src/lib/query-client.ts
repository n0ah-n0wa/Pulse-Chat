import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { API_ERROR_CODES } from '@pulse-chat/shared';

import { isApiClientError } from './errors';
import { useAuthStore } from '../store/auth-store';

function handleGlobalQueryError(error: unknown): void {
  if (!isApiClientError(error)) {
    return;
  }

  if (error.statusCode === 401 || error.code === API_ERROR_CODES.UNAUTHORIZED) {
    useAuthStore.getState().clearSession();
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: handleGlobalQueryError,
  }),
  mutationCache: new MutationCache({
    onError: handleGlobalQueryError,
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        if (isApiClientError(error) && error.statusCode === 401) {
          return false;
        }

        return failureCount < 2;
      },
    },
  },
});
