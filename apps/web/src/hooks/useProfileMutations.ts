import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import type { CurrentUserProfile, UpdateUserProfileInput } from '@pulse-chat/shared';

import { queryKeys } from '../lib/query-keys';
import { authService } from '../services/auth-service';
import { usersService } from '../services/users-service';
import { useAuthStore } from '../store/auth-store';

function syncCurrentUser(queryClient: QueryClient, profile: CurrentUserProfile): void {
  useAuthStore.getState().updateUser(profile);
  queryClient.setQueryData(queryKeys.users.me(), profile);
  queryClient.setQueryData(queryKeys.users.profile(profile.id), profile);
  queryClient.setQueryData(queryKeys.users.byUsername(profile.username), profile);
}

export function useCurrentUserProfileQuery() {
  const sessionUser = useAuthStore((state) => state.user);

  return useQuery({
    queryKey: queryKeys.users.me(),
    queryFn: () => authService.me(),
    enabled: sessionUser !== null,
    staleTime: 30_000,
    initialData: sessionUser ?? undefined,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateUserProfileInput) => usersService.updateMe(input),
    onSuccess: (profile) => {
      syncCurrentUser(queryClient, profile);
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}

export function useUploadAvatar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => usersService.uploadAvatar(file),
    onSuccess: (profile) => {
      syncCurrentUser(queryClient, profile);
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}
