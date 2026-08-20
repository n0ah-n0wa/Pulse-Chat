import { randomUUID } from 'node:crypto';

import type { CreateUserInput } from '@pulse-chat/shared';

import type { UserRepository } from '../users/user.repository.interface.js';

const TEST_PASSWORD_HASH = 'test-password-hash-not-for-production';

/** Creates a persisted user for integration and repository tests. */
export async function createTestUser(
  repository: UserRepository,
  overrides: Partial<CreateUserInput> = {},
): Promise<{ readonly id: string; readonly username: string; readonly email: string }> {
  const suffix = randomUUID().slice(0, 8);
  const user = await repository.create({
    username: overrides.username ?? `user_${suffix}`,
    email: overrides.email ?? `user_${suffix}@example.com`,
    passwordHash: overrides.passwordHash ?? TEST_PASSWORD_HASH,
    displayName: overrides.displayName ?? 'Test User',
    avatarUrl: overrides.avatarUrl,
    bio: overrides.bio,
    role: overrides.role,
  });

  return {
    id: user.id,
    username: user.username,
    email: user.email,
  };
}
