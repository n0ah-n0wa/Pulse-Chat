import type { UserRole } from './user-role.js';

/** Public profile returned by `GET /users/:id`. */
export interface PublicUserProfile {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly avatarUrl?: string;
  readonly bio?: string;
  readonly role: UserRole;
  readonly createdAt: string;
  readonly lastSeenAt?: string;
}

/** Profile returned by authenticated endpoints such as `PATCH /users/me`. */
export interface CurrentUserProfile extends PublicUserProfile {
  readonly email: string;
  readonly updatedAt: string;
}
