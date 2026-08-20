import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Model, Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../../app.module.js';
import { RedisService } from '../../infrastructure/redis/redis.service.js';
import { startMongoMemoryServer, stopMongoMemoryServer } from '../../test/mongo-memory.js';
import { TestRedisService } from '../../test/test-redis.service.js';
import type { MessageRecord, MessageRepository } from '../message.repository.interface.js';
import { MESSAGE_REPOSITORY } from '../messages.tokens.js';
import { MessageDocument } from './message.schema.js';

const ROOM_A = '507f1f77bcf86cd799439021';
const ROOM_B = '507f1f77bcf86cd799439022';
const AUTHOR_A = '507f1f77bcf86cd799439011';
const AUTHOR_B = '507f1f77bcf86cd799439012';

describe('MongooseMessageRepository', () => {
  let repository: MessageRepository;
  let moduleRef: TestingModule;
  let messageModel: Model<MessageDocument>;

  beforeAll(async () => {
    process.env['MONGODB_URI'] = await startMongoMemoryServer();

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RedisService)
      .useClass(TestRedisService)
      .compile();

    repository = moduleRef.get(MESSAGE_REPOSITORY);
    messageModel = moduleRef.get<Model<MessageDocument>>(getModelToken(MessageDocument.name));
    await messageModel.syncIndexes();
  });

  afterAll(async () => {
    await moduleRef?.close();
    await stopMongoMemoryServer();
  });

  beforeEach(async () => {
    await messageModel.deleteMany({}).exec();
  });

  it('creates the documented message indexes', async () => {
    const indexes = await messageModel.collection.indexes();
    const keys = indexes.map((index) => JSON.stringify(index.key));

    expect(keys).toEqual(
      expect.arrayContaining([
        JSON.stringify({ roomId: 1, createdAt: -1, _id: -1 }),
        JSON.stringify({ authorId: 1, createdAt: -1, _id: -1 }),
        JSON.stringify({ roomId: 1, clientMessageId: 1, authorId: 1 }),
        JSON.stringify({ roomId: 1, _fts: 'text', _ftsx: 1 }),
      ]),
    );

    const idempotency = indexes.find(
      (index) =>
        JSON.stringify(index.key) ===
        JSON.stringify({ roomId: 1, clientMessageId: 1, authorId: 1 }),
    );
    expect(idempotency?.unique).toBe(true);
  });

  it('rejects a duplicate clientMessageId for the same author in the same room', async () => {
    await repository.create({
      roomId: ROOM_A,
      authorId: AUTHOR_A,
      content: 'First',
      clientMessageId: 'dup-1',
    });

    await expect(
      repository.create({
        roomId: ROOM_A,
        authorId: AUTHOR_A,
        content: 'Retry',
        clientMessageId: 'dup-1',
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('allows the same clientMessageId for a different author or room', async () => {
    await repository.create({
      roomId: ROOM_A,
      authorId: AUTHOR_A,
      content: 'A',
      clientMessageId: 'shared',
    });

    await expect(
      repository.create({
        roomId: ROOM_A,
        authorId: AUTHOR_B,
        content: 'B',
        clientMessageId: 'shared',
      }),
    ).resolves.toMatchObject({ authorId: AUTHOR_B });

    await expect(
      repository.create({
        roomId: ROOM_B,
        authorId: AUTHOR_A,
        content: 'C',
        clientMessageId: 'shared',
      }),
    ).resolves.toMatchObject({ roomId: ROOM_B });
  });

  it('pages by createdAt without returning more than the requested limit', async () => {
    const created: MessageRecord[] = [];
    for (let index = 0; index < 5; index += 1) {
      created.push(
        await repository.create({
          roomId: ROOM_A,
          authorId: AUTHOR_A,
          content: `msg-${String(index)}`,
          clientMessageId: `client-${String(index)}`,
        }),
      );
    }

    const page = await repository.findPage({ roomId: ROOM_A, limit: 2 });

    expect(page).toHaveLength(2);
    expect(page[0]?.id).toBe(created[4]?.id);
    expect(page[1]?.id).toBe(created[3]?.id);

    const next = await repository.findPage({
      roomId: ROOM_A,
      limit: 2,
      before: { createdAt: page[1]!.createdAt, id: page[1]!.id },
    });

    expect(next).toHaveLength(2);
    expect(next[0]?.id).toBe(created[2]?.id);
    expect(next.map((item) => item.roomId)).toEqual([ROOM_A, ROOM_A]);
  });

  it('does not include messages from other rooms in a page', async () => {
    await repository.create({
      roomId: ROOM_A,
      authorId: AUTHOR_A,
      content: 'in-room',
      clientMessageId: 'a',
    });
    await repository.create({
      roomId: ROOM_B,
      authorId: AUTHOR_A,
      content: 'other-room',
      clientMessageId: 'b',
    });

    const page = await repository.findPage({ roomId: ROOM_A, limit: 10 });

    expect(page).toHaveLength(1);
    expect(page[0]?.content).toBe('in-room');
  });

  it('finds a message by clientMessageId scoped to author and room', async () => {
    await repository.create({
      roomId: ROOM_A,
      authorId: AUTHOR_A,
      content: 'mine',
      clientMessageId: 'lookup',
    });
    await repository.create({
      roomId: ROOM_A,
      authorId: AUTHOR_B,
      content: 'theirs',
      clientMessageId: 'lookup',
    });

    const found = await repository.findByClientMessageId(ROOM_A, AUTHOR_A, 'lookup');

    expect(found?.content).toBe('mine');
    expect(found?.authorId).toBe(AUTHOR_A);
  });

  it('uses ObjectId values for room and author on write', async () => {
    const created = await repository.create({
      roomId: ROOM_A,
      authorId: AUTHOR_A,
      content: 'typed',
      clientMessageId: 'typed-1',
    });

    const raw = await messageModel.findById(created.id).lean().exec();

    expect(raw?.roomId).toBeInstanceOf(Types.ObjectId);
    expect(raw?.authorId).toBeInstanceOf(Types.ObjectId);
    expect(created.roomId).toBe(ROOM_A);
    expect(created.authorId).toBe(AUTHOR_A);
  });

  it('updates content and editedAt without removing the document', async () => {
    const created = await repository.create({
      roomId: ROOM_A,
      authorId: AUTHOR_A,
      content: 'before',
      clientMessageId: 'edit-1',
    });

    const editedAt = new Date('2026-08-18T04:00:00.000Z');
    const updated = await repository.updateContent(created.id, 'after', editedAt);

    expect(updated).toMatchObject({
      id: created.id,
      content: 'after',
      editedAt,
    });

    const raw = await messageModel.findById(created.id).lean().exec();
    expect(raw?.content).toBe('after');
    expect(raw?.deletedAt).toBeUndefined();
  });

  it('soft-deletes by setting deletedAt and keeps the original content in MongoDB', async () => {
    const created = await repository.create({
      roomId: ROOM_A,
      authorId: AUTHOR_A,
      content: 'keep-me',
      clientMessageId: 'del-1',
    });

    const deletedAt = new Date('2026-08-18T05:00:00.000Z');
    const deleted = await repository.softDelete(created.id, deletedAt);

    expect(deleted?.deletedAt).toEqual(deletedAt);
    expect(deleted?.content).toBe('keep-me');

    const raw = await messageModel.findById(created.id).lean().exec();
    expect(raw).not.toBeNull();
    expect(raw?.content).toBe('keep-me');
    expect(raw?.deletedAt).toEqual(deletedAt);

    await expect(repository.updateContent(created.id, 'nope', new Date())).resolves.toBeNull();
    await expect(repository.softDelete(created.id, new Date())).resolves.toBeNull();
  });

  it('searches within a room using the text index and excludes other rooms', async () => {
    await repository.create({
      roomId: ROOM_A,
      authorId: AUTHOR_A,
      content: 'Plan the deployment rollout',
      clientMessageId: 'search-a',
    });
    await repository.create({
      roomId: ROOM_B,
      authorId: AUTHOR_A,
      content: 'Another deployment elsewhere',
      clientMessageId: 'search-b',
    });

    const hits = await repository.searchPage({
      roomId: ROOM_A,
      searchText: '"deployment"',
      limit: 10,
    });

    expect(hits).toHaveLength(1);
    expect(hits[0]?.roomId).toBe(ROOM_A);
    expect(hits[0]?.content).toContain('deployment');
  });

  it('excludes soft-deleted messages from search results', async () => {
    const created = await repository.create({
      roomId: ROOM_A,
      authorId: AUTHOR_A,
      content: 'deployment archived',
      clientMessageId: 'search-del',
    });

    await repository.softDelete(created.id, new Date());

    const hits = await repository.searchPage({
      roomId: ROOM_A,
      searchText: '"deployment"',
      limit: 10,
    });

    expect(hits).toHaveLength(0);
  });

  it('pages search results newest-first within a room', async () => {
    const oldest = await repository.create({
      roomId: ROOM_A,
      authorId: AUTHOR_A,
      content: 'deployment oldest',
      clientMessageId: 'search-old',
    });
    const middle = await repository.create({
      roomId: ROOM_A,
      authorId: AUTHOR_A,
      content: 'deployment middle',
      clientMessageId: 'search-mid',
    });
    const newest = await repository.create({
      roomId: ROOM_A,
      authorId: AUTHOR_A,
      content: 'deployment newest',
      clientMessageId: 'search-new',
    });

    const page = await repository.searchPage({
      roomId: ROOM_A,
      searchText: '"deployment"',
      limit: 2,
    });

    expect(page.map((item) => item.id)).toEqual([newest.id, middle.id]);

    const next = await repository.searchPage({
      roomId: ROOM_A,
      searchText: '"deployment"',
      limit: 2,
      before: { createdAt: page[1]!.createdAt, id: page[1]!.id },
    });

    expect(next).toHaveLength(1);
    expect(next[0]?.id).toBe(oldest.id);
  });
});
