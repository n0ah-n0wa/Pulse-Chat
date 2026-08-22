import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { USER_ERROR_CODES } from '@pulse-chat/shared';

import { ApiException } from '../common/errors/api.exception.js';
import type { AppConfigService } from '../config/index.js';
import type { FileUploadService } from '../infrastructure/storage/file-upload.service.js';
import { UsersService } from './users.service.js';
import type { UserRepository } from './user.repository.interface.js';

describe('UsersService', () => {
  const findById = vi.fn<UserRepository['findById']>();
  const findByUsername = vi.fn<UserRepository['findByUsername']>();
  const searchByQuery = vi.fn<UserRepository['searchByQuery']>();
  const updateProfile = vi.fn<UserRepository['updateProfile']>();

  const repository: UserRepository = {
    findById,
    findByEmail: vi.fn(),
    findByUsername,
    findByUsernames: vi.fn(),
    findByIds: vi.fn(),
    searchByQuery,
    create: vi.fn(),
    updateProfile,
    updateLastSeenAt: vi.fn(),
  };

  const fileUploads = {
    upload: vi.fn(),
    delete: vi.fn(),
    getUrl: vi.fn(),
  } as unknown as FileUploadService;

  const config = {
    fileStorage: { provider: 'local', path: '/tmp' },
  } as unknown as AppConfigService;

  const service = new UsersService(repository, fileUploads, config);

  it('returns a public profile without password or internal fields', async () => {
    findById.mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      username: 'alex',
      email: 'alex@example.com',
      displayName: 'Alex',
      bio: 'Builder',
      role: 'USER',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });

    await expect(service.getPublicProfile('507f1f77bcf86cd799439011')).resolves.toEqual({
      id: '507f1f77bcf86cd799439011',
      username: 'alex',
      displayName: 'Alex',
      bio: 'Builder',
      role: 'USER',
      createdAt: '2026-01-01T00:00:00.000Z',
      lastSeenAt: undefined,
    });
  });

  it('returns a public profile by username', async () => {
    findByUsername.mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      username: 'alex',
      email: 'alex@example.com',
      displayName: 'Alex',
      role: 'USER',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });

    await expect(service.getPublicProfileByUsername('alex')).resolves.toMatchObject({
      id: '507f1f77bcf86cd799439011',
      username: 'alex',
    });
  });

  it('maps directory search results to public profiles', async () => {
    searchByQuery.mockResolvedValue([
      {
        id: '507f1f77bcf86cd799439012',
        username: 'bob',
        email: 'bob@example.com',
        displayName: 'Bob Builder',
        role: 'USER',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ]);

    await expect(
      service.searchPublicProfiles('507f1f77bcf86cd799439011', { q: 'bob' }),
    ).resolves.toMatchObject([
      {
        id: '507f1f77bcf86cd799439012',
        username: 'bob',
        displayName: 'Bob Builder',
        role: 'USER',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    expect(searchByQuery).toHaveBeenCalledWith({
      text: 'bob',
      limit: 20,
      excludeUserId: '507f1f77bcf86cd799439011',
    });
  });

  it('throws USER_NOT_FOUND for invalid ids', async () => {
    await expect(service.getPublicProfile('not-an-object-id')).rejects.toMatchObject({
      code: USER_ERROR_CODES.USER_NOT_FOUND,
    });
  });

  it('throws USER_NOT_FOUND when the user does not exist', async () => {
    findById.mockResolvedValue(null);

    await expect(service.getPublicProfile('507f1f77bcf86cd799439011')).rejects.toBeInstanceOf(
      ApiException,
    );
  });

  it('updates the current user profile and returns email', async () => {
    updateProfile.mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      username: 'alex',
      email: 'alex@example.com',
      displayName: 'Alex Updated',
      bio: 'New bio',
      role: 'USER',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-03T00:00:00.000Z'),
    });

    await expect(
      service.updateCurrentUserProfile('507f1f77bcf86cd799439011', {
        displayName: 'Alex Updated',
        bio: 'New bio',
      }),
    ).resolves.toEqual({
      id: '507f1f77bcf86cd799439011',
      username: 'alex',
      email: 'alex@example.com',
      displayName: 'Alex Updated',
      bio: 'New bio',
      role: 'USER',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-03T00:00:00.000Z',
      lastSeenAt: undefined,
    });
  });

  it('rejects a username that is already taken', async () => {
    findByUsername.mockResolvedValue({
      id: '507f1f77bcf86cd799439099',
      username: 'taken',
      email: 'other@example.com',
      displayName: 'Other',
      role: 'USER',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });

    await expect(
      service.updateCurrentUserProfile('507f1f77bcf86cd799439011', { username: 'taken' }),
    ).rejects.toMatchObject({
      code: USER_ERROR_CODES.USERNAME_ALREADY_TAKEN,
    });
  });

  it('throws USER_NOT_FOUND when updating a missing user', async () => {
    updateProfile.mockResolvedValue(null);

    try {
      await service.updateCurrentUserProfile('507f1f77bcf86cd799439011', {
        displayName: 'Missing',
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ApiException);
      expect((error as ApiException).getStatus()).toBe(HttpStatus.NOT_FOUND);
      return;
    }

    throw new Error('expected update to fail');
  });

  it('records lastSeenAt without failing when the user is missing', async () => {
    const updateLastSeenAt = vi.fn<UserRepository['updateLastSeenAt']>().mockResolvedValue(null);
    const service = new UsersService(
      {
        findById,
        findByEmail: vi.fn(),
        findByUsername,
        findByUsernames: vi.fn(),
        findByIds: vi.fn(),
        searchByQuery: vi.fn(),
        create: vi.fn(),
        updateProfile,
        updateLastSeenAt,
      },
      fileUploads,
      config,
    );

    await expect(
      service.recordLastSeen('507f1f77bcf86cd799439011', new Date('2026-08-18T12:00:00.000Z')),
    ).resolves.toBeUndefined();

    expect(updateLastSeenAt).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      new Date('2026-08-18T12:00:00.000Z'),
    );
  });
});
