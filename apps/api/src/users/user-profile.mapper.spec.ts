import { describe, expect, it } from 'vitest';

import { toCurrentUserProfile, toPublicUserProfile } from './user-profile.mapper.js';
import type { UserRecord } from './user.repository.interface.js';

const sampleUser: UserRecord = {
  id: '507f1f77bcf86cd799439011',
  username: 'alex',
  email: 'alex@example.com',
  passwordHash: 'secret-hash',
  displayName: 'Alex',
  bio: 'Hello',
  role: 'USER',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  lastSeenAt: new Date('2026-01-02T12:00:00.000Z'),
};

describe('user profile mappers', () => {
  it('maps public profiles without email or password hash', () => {
    expect(toPublicUserProfile(sampleUser)).toEqual({
      id: '507f1f77bcf86cd799439011',
      username: 'alex',
      displayName: 'Alex',
      bio: 'Hello',
      role: 'USER',
      createdAt: '2026-01-01T00:00:00.000Z',
      lastSeenAt: '2026-01-02T12:00:00.000Z',
    });
  });

  it('maps stored avatar keys to the public avatar endpoint', () => {
    expect(
      toPublicUserProfile({
        ...sampleUser,
        avatarUrl: '11111111-1111-4111-8111-111111111111.png',
      }).avatarUrl,
    ).toBe('/api/users/507f1f77bcf86cd799439011/avatar');
  });

  it('maps current user profiles with email and updatedAt', () => {
    expect(toCurrentUserProfile(sampleUser)).toEqual({
      id: '507f1f77bcf86cd799439011',
      username: 'alex',
      email: 'alex@example.com',
      displayName: 'Alex',
      bio: 'Hello',
      role: 'USER',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      lastSeenAt: '2026-01-02T12:00:00.000Z',
    });
  });
});
