import type {
  CurrentUserProfile,
  PublicUserProfile,
  UpdateUserProfileInput,
} from '@pulse-chat/shared';

import type { UserRecord } from './user.repository.interface.js';

function toIsoString(value: Date | undefined): string | undefined {
  return value?.toISOString();
}

/** Maps a persisted user to the public API profile shape. */
export function toPublicUserProfile(user: UserRecord): PublicUserProfile {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
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
  bio?: string;
} {
  return {
    ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
    ...(input.bio !== undefined ? { bio: input.bio } : {}),
  };
}
