import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Model } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../../app.module.js';
import { RedisService } from '../../infrastructure/redis/redis.service.js';
import { createTestUser } from '../../test/create-test-user.js';
import { startMongoMemoryServer, stopMongoMemoryServer } from '../../test/mongo-memory.js';
import { TestRedisService } from '../../test/test-redis.service.js';
import type { UserRepository } from '../user.repository.interface.js';
import { USER_REPOSITORY } from '../users.tokens.js';
import { UserDocument } from './user.schema.js';

describe('MongooseUserRepository', () => {
  let repository: UserRepository;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    process.env['MONGODB_URI'] = await startMongoMemoryServer();

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RedisService)
      .useClass(TestRedisService)
      .compile();

    repository = moduleRef.get(USER_REPOSITORY);
    const userModel = moduleRef.get<Model<UserDocument>>(getModelToken(UserDocument.name));
    await userModel.syncIndexes();
  });

  afterAll(async () => {
    await moduleRef?.close();
    await stopMongoMemoryServer();
  });

  it('enforces unique email and username', async () => {
    await createTestUser(repository, {
      username: 'unique_user',
      email: 'unique@example.com',
    });

    await expect(
      createTestUser(repository, {
        username: 'unique_user',
        email: 'other@example.com',
      }),
    ).rejects.toThrow();

    await expect(
      createTestUser(repository, {
        username: 'other_user',
        email: 'unique@example.com',
      }),
    ).rejects.toThrow();
  });

  it('never returns passwordHash from findById', async () => {
    const created = await createTestUser(repository, {
      username: 'public_user',
      email: 'public@example.com',
      displayName: 'Public User',
    });

    const found = await repository.findById(created.id);

    expect(found).toMatchObject({
      id: created.id,
      username: 'public_user',
      email: 'public@example.com',
      displayName: 'Public User',
    });
    expect(found?.passwordHash).toBeUndefined();
  });

  it('never returns passwordHash from findByUsername', async () => {
    const created = await createTestUser(repository, {
      username: 'by_username',
      email: 'by_username@example.com',
      displayName: 'By Username',
    });

    const found = await repository.findByUsername(created.username);

    expect(found?.id).toBe(created.id);
    expect(found?.passwordHash).toBeUndefined();
  });

  it('searches by username or display name and excludes a caller', async () => {
    const alice = await createTestUser(repository, {
      username: 'search_alice',
      email: 'search_alice@example.com',
      displayName: 'Alice Search',
    });
    const bob = await createTestUser(repository, {
      username: 'search_bob',
      email: 'search_bob@example.com',
      displayName: 'Bob Builder',
    });

    const byUsername = await repository.searchByQuery({
      text: 'search_bob',
      limit: 20,
      excludeUserId: alice.id,
    });
    expect(byUsername.map((user) => user.id)).toEqual([bob.id]);
    expect(byUsername[0]?.passwordHash).toBeUndefined();

    const byDisplayName = await repository.searchByQuery({
      text: 'builder',
      limit: 20,
      excludeUserId: alice.id,
    });
    expect(byDisplayName.map((user) => user.id)).toEqual([bob.id]);

    const excludingSelf = await repository.searchByQuery({
      text: 'search_alice',
      limit: 20,
      excludeUserId: alice.id,
    });
    expect(excludingSelf).toEqual([]);
  });

  it('updates profile fields', async () => {
    const created = await createTestUser(repository, {
      username: 'profile_user',
      email: 'profile@example.com',
      displayName: 'Before',
    });

    const updated = await repository.updateProfile(created.id, {
      displayName: 'After',
      bio: 'Updated bio',
    });

    expect(updated).toMatchObject({
      id: created.id,
      displayName: 'After',
      bio: 'Updated bio',
    });
  });

  it('persists lastSeenAt', async () => {
    const created = await createTestUser(repository, {
      username: 'seen_user',
      email: 'seen@example.com',
    });

    const lastSeenAt = new Date('2026-08-18T12:00:00.000Z');
    const updated = await repository.updateLastSeenAt(created.id, lastSeenAt);

    expect(updated?.lastSeenAt?.toISOString()).toBe(lastSeenAt.toISOString());
  });
});
