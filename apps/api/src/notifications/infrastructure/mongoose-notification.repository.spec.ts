import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Model } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { NOTIFICATION_TYPES } from '@pulse-chat/shared';

import { AppModule } from '../../app.module.js';
import { RedisService } from '../../infrastructure/redis/redis.service.js';
import { startMongoMemoryServer, stopMongoMemoryServer } from '../../test/mongo-memory.js';
import { TestRedisService } from '../../test/test-redis.service.js';
import type { NotificationRepository } from '../notification.repository.interface.js';
import { NOTIFICATION_REPOSITORY } from '../notifications.tokens.js';
import { NotificationDocument } from './notification.schema.js';

const USER_A = '507f1f77bcf86cd799439011';
const USER_B = '507f1f77bcf86cd799439012';
const ACTOR = '507f1f77bcf86cd799439021';
const REF = '507f1f77bcf86cd799439031';

describe('MongooseNotificationRepository', () => {
  let repository: NotificationRepository;
  let moduleRef: TestingModule;
  let model: Model<NotificationDocument>;

  beforeAll(async () => {
    process.env['MONGODB_URI'] = await startMongoMemoryServer();

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RedisService)
      .useClass(TestRedisService)
      .compile();

    repository = moduleRef.get(NOTIFICATION_REPOSITORY);
    model = moduleRef.get<Model<NotificationDocument>>(getModelToken(NotificationDocument.name));
    await model.syncIndexes();
  });

  afterAll(async () => {
    await moduleRef?.close();
    await stopMongoMemoryServer();
  });

  beforeEach(async () => {
    await model.deleteMany({}).exec();
  });

  it('creates the expected indexes', async () => {
    const indexes = await model.collection.indexes();
    const keyStrings = indexes.map((index) => JSON.stringify(index.key));
    expect(keyStrings).toContain(JSON.stringify({ userId: 1, type: 1, referenceId: 1, actorId: 1 }));
    expect(keyStrings).toContain(JSON.stringify({ userId: 1, createdAt: -1, _id: -1 }));
  });

  it('creates a new notification record on first call', async () => {
    const { record, created } = await repository.findOrCreate({
      userId: USER_A,
      type: NOTIFICATION_TYPES.MENTION,
      referenceId: REF,
      actorId: ACTOR,
    });

    expect(created).toBe(true);
    expect(record.userId).toBe(USER_A);
    expect(record.type).toBe(NOTIFICATION_TYPES.MENTION);
    expect(record.isRead).toBe(false);
  });

  it('returns the existing record on duplicate creation attempts', async () => {
    const input = {
      userId: USER_A,
      type: NOTIFICATION_TYPES.REPLY,
      referenceId: REF,
      actorId: ACTOR,
    };

    const first = await repository.findOrCreate(input);
    const second = await repository.findOrCreate(input);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.record.id).toBe(first.record.id);
  });

  it('lists notifications for the correct user only', async () => {
    await repository.findOrCreate({
      userId: USER_A,
      type: NOTIFICATION_TYPES.MENTION,
      referenceId: REF,
      actorId: ACTOR,
    });
    await repository.findOrCreate({
      userId: USER_B,
      type: NOTIFICATION_TYPES.MENTION,
      referenceId: REF,
      actorId: ACTOR,
    });

    const records = await repository.findPage({ userId: USER_A, limit: 10 });
    expect(records).toHaveLength(1);
    expect(records[0]?.userId).toBe(USER_A);
  });

  it('pages with cursor correctly (newest-first)', async () => {
    const inputs = [
      { userId: USER_A, type: NOTIFICATION_TYPES.MENTION, referenceId: REF, actorId: ACTOR },
      { userId: USER_A, type: NOTIFICATION_TYPES.REPLY, referenceId: REF, actorId: ACTOR },
      { userId: USER_A, type: NOTIFICATION_TYPES.DIRECT_MESSAGE, referenceId: REF, actorId: ACTOR },
    ] as const;

    for (const input of inputs) {
      await repository.findOrCreate(input);
    }

    const page1 = await repository.findPage({ userId: USER_A, limit: 2 });
    expect(page1).toHaveLength(2);

    const cursor = page1[page1.length - 1]!;
    const page2 = await repository.findPage({
      userId: USER_A,
      limit: 2,
      before: { createdAt: cursor.createdAt, id: cursor.id },
    });
    expect(page2).toHaveLength(1);
  });

  it('markRead updates only the owner\'s notification', async () => {
    const { record } = await repository.findOrCreate({
      userId: USER_A,
      type: NOTIFICATION_TYPES.MENTION,
      referenceId: REF,
      actorId: ACTOR,
    });

    // Wrong owner → null
    const wrongOwner = await repository.markRead(record.id, USER_B);
    expect(wrongOwner).toBeNull();

    // Correct owner
    const updated = await repository.markRead(record.id, USER_A);
    expect(updated?.isRead).toBe(true);
  });

  it('markAllRead flips all unread notifications for the user', async () => {
    for (const ref of ['507f1f77bcf86cd799439031', '507f1f77bcf86cd799439032']) {
      await repository.findOrCreate({
        userId: USER_A,
        type: NOTIFICATION_TYPES.MENTION,
        referenceId: ref,
        actorId: ACTOR,
      });
    }

    await repository.markAllRead(USER_A);

    const records = await repository.findPage({ userId: USER_A, limit: 10 });
    expect(records.every((r) => r.isRead)).toBe(true);
  });

  it('findById returns null for unknown id', async () => {
    const result = await repository.findById('507f1f77bcf86cd799439099');
    expect(result).toBeNull();
  });

  it('findById returns null for non-ObjectId strings', async () => {
    const result = await repository.findById('bad-id');
    expect(result).toBeNull();
  });
});
