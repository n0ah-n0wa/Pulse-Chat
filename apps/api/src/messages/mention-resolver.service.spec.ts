import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserRepository } from '../users/user.repository.interface.js';
import { MentionResolverService } from './mention-resolver.service.js';

describe('MentionResolverService', () => {
  const findByUsernames = vi.fn<UserRepository['findByUsernames']>();
  const users: UserRepository = {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    findByUsername: vi.fn(),
    findByUsernames,
    findByIds: vi.fn(),
    create: vi.fn(),
    updateProfile: vi.fn(),
    updateLastSeenAt: vi.fn(),
  };

  const service = new MentionResolverService(users);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns user ids for resolved @username mentions', async () => {
    findByUsernames.mockResolvedValue([
      {
        id: '507f1f77bcf86cd799439011',
        username: 'alice',
        email: 'alice@example.com',
        displayName: 'Alice',
        role: 'USER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '507f1f77bcf86cd799439012',
        username: 'bob',
        email: 'bob@example.com',
        displayName: 'Bob',
        role: 'USER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const ids = await service.resolveMentionedUserIds('Hey @alice and @bob');

    expect(findByUsernames).toHaveBeenCalledWith(['alice', 'bob']);
    expect(ids).toEqual(['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012']);
  });

  it('ignores nonexistent usernames', async () => {
    findByUsernames.mockResolvedValue([]);

    const ids = await service.resolveMentionedUserIds('Hello @nobody');

    expect(ids).toEqual([]);
  });

  it('does not resolve ObjectId-like tokens', async () => {
    const ids = await service.resolveMentionedUserIds('Hey @507f1f77bcf86cd799439011');

    expect(findByUsernames).not.toHaveBeenCalled();
    expect(ids).toEqual([]);
  });

  it('returns an empty array when there are no mentions', async () => {
    const ids = await service.resolveMentionedUserIds('Plain message');

    expect(findByUsernames).not.toHaveBeenCalled();
    expect(ids).toEqual([]);
  });
});
