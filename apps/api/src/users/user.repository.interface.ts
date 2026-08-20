import { USER_ROLES, type CreateUserInput, type UserRole } from '@pulse-chat/shared';

/** Domain representation of a persisted user independent of MongoDB. */
export interface UserRecord {
  readonly id: string;
  readonly username: string;
  readonly email: string;
  readonly passwordHash?: string;
  readonly displayName: string;
  readonly avatarUrl?: string;
  readonly bio?: string;
  readonly role: UserRole;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lastSeenAt?: Date;
}

export interface UpdateUserProfileData {
  readonly displayName?: string;
  readonly bio?: string;
}

/** Data-access contract for user persistence. */
export interface UserRepository {
  findById(id: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  findByUsername(username: string): Promise<UserRecord | null>;
  findByUsernames(usernames: readonly string[]): Promise<UserRecord[]>;
  findByIds(ids: readonly string[]): Promise<UserRecord[]>;
  create(input: CreateUserInput): Promise<UserRecord>;
  updateProfile(id: string, update: UpdateUserProfileData): Promise<UserRecord | null>;
  updateLastSeenAt(id: string, lastSeenAt: Date): Promise<UserRecord | null>;
}

export const defaultUserRole = USER_ROLES.USER;
