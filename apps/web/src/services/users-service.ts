import type {
  CurrentUserProfile,
  PublicUserProfile,
  UpdateUserProfileInput,
} from '@pulse-chat/shared';

import { apiClient, apiRequest } from './api-client';

export const usersService = {
  search(query: string): Promise<PublicUserProfile[]> {
    const params = new URLSearchParams({ q: query });
    return apiClient.get<PublicUserProfile[]>(`/api/users/search?${params.toString()}`);
  },

  getPublicProfile(userId: string): Promise<PublicUserProfile> {
    return apiClient.get<PublicUserProfile>(`/api/users/${userId}`);
  },

  getPublicProfileByUsername(username: string): Promise<PublicUserProfile> {
    return apiClient.get<PublicUserProfile>(`/api/users/username/${encodeURIComponent(username)}`);
  },

  updateMe(input: UpdateUserProfileInput): Promise<CurrentUserProfile> {
    return apiClient.patch<CurrentUserProfile>('/api/users/me', input);
  },

  uploadAvatar(file: File): Promise<CurrentUserProfile> {
    const body = new FormData();
    body.append('file', file);
    return apiRequest<CurrentUserProfile>('/api/users/me/avatar', {
      method: 'POST',
      body,
    });
  },
};
