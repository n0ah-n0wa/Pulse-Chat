import type {
  CurrentUserProfile,
  PublicUserProfile,
  UpdateUserProfileInput,
} from '@pulse-chat/shared';

import type { UserRecord } from './user.repository.interface.js';

function toIsoString(value: Date | undefined): string | undefined {
  return value?.toISOString();
}

function isStoredAvatarKey(avatarUrl: string): boolean {
  return (
    !avatarUrl.startsWith('/') &&
    !avatarUrl.startsWith('http://') &&
    !avatarUrl.startsWith('https://')
  );
}

export function getStoredAvatarKey(user: UserRecord): string | undefined {
  if (user.avatarUrl === undefined || user.avatarUrl.length === 0) {
    return undefined;
  }

  return isStoredAvatarKey(user.avatarUrl) ? user.avatarUrl : undefined;
}

/** Public URL for an uploaded avatar, or a previously stored absolute URL. */
export function toPublicAvatarUrl(user: UserRecord): string | undefined {
  if (user.avatarUrl === undefined || user.avatarUrl.length === 0) {
    return undefined;
  }

  if (isStoredAvatarKey(user.avatarUrl)) {
    return `/api/users/${user.id}/avatar`;
  }

  return user.avatarUrl;
}

/** Maps a persisted user to the public API profile shape. */
export function toPublicUserProfile(user: UserRecord): PublicUserProfile {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: toPublicAvatarUrl(user),
    bio: user.bio,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    lastSeenAt: toIsoString(user.lastSeenAt),
  };
}

/** Maps a persisted user to the authenticated profile shape. */
export function toCurrentUserProfile(user: UserRecord): CurrentUserProfile {
  return {
    ...toPublicUserProfile(user),
    email: user.email,
    updatedAt: user.updatedAt.toISOString(),
  };
}

/** Normalises validated profile updates before persistence. */
export function toUpdateUserProfileData(input: UpdateUserProfileInput): {
  displayName?: string;
  username?: string;
  bio?: string;
} {
  return {
    ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
    ...(input.username !== undefined ? { username: input.username } : {}),
    ...(input.bio !== undefined ? { bio: input.bio } : {}),
  };
}
