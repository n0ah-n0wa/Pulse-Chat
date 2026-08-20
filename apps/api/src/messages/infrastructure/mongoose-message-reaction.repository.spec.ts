import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Model } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../../app.module.js';
import { RedisService } from '../../infrastructure/redis/redis.service.js';
import { startMongoMemoryServer, stopMongoMemoryServer } from '../../test/mongo-memory.js';
import { TestRedisService } from '../../test/test-redis.service.js';
import type {
  MessageReactionRepository,
  MessageRepository,
} from '../message.repository.interface.js';
import { MESSAGE_REACTION_REPOSITORY, MESSAGE_REPOSITORY } from '../messages.tokens.js';
import { MessageReactionDocument } from './message-reaction.schema.js';

const ROOM_ID = '507f1f77bcf86cd799439021';
const AUTHOR_ID = '507f1f77bcf86cd799439011';
const OTHER_USER_ID = '507f1f77bcf86cd799439012';

describe('MongooseMessageReactionRepository', () => {
  let reactionRepository: MessageReactionRepository;
  let messageRepository: MessageRepository;
  let moduleRef: TestingModule;
  let reactionModel: Model<MessageReactionDocument>;

  beforeAll(async () => {
    process.env['MONGODB_URI'] = await startMongoMemoryServer();

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RedisService)
      .useClass(TestRedisService)
      .compile();

    reactionRepository = moduleRef.get(MESSAGE_REACTION_REPOSITORY);
    messageRepository = moduleRef.get(MESSAGE_REPOSITORY);
    reactionModel = moduleRef.get<Model<MessageReactionDocument>>(
      getModelToken(MessageReactionDocument.name),
    );
    await reactionModel.syncIndexes();
  });

  afterAll(async () => {
    await moduleRef?.close();
    await stopMongoMemoryServer();
  });

  beforeEach(async () => {
    await reactionModel.deleteMany({}).exec();
  });

  it('enforces the compound unique index on messageId, userId, and emoji', async () => {
    const message = await messageRepository.create({
      roomId: ROOM_ID,
      authorId: AUTHOR_ID,
      content: 'React to me',
      clientMessageId: 'reaction-unique',
    });

    await reactionRepository.create({ messageId: message.id, userId: AUTHOR_ID, emoji: '👍' });

    await expect(
      reactionRepository.create({ messageId: message.id, userId: AUTHOR_ID, emoji: '👍' }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('summarizes reactions by message and current user', async () => {
    const message = await messageRepository.create({
      roomId: ROOM_ID,
      authorId: AUTHOR_ID,
      content: 'Summaries',
      clientMessageId: 'reaction-summary',
    });

    await reactionRepository.create({ messageId: message.id, userId: AUTHOR_ID, emoji: '👍' });
    await reactionRepository.create({ messageId: message.id, userId: OTHER_USER_ID, emoji: '👍' });
    await reactionRepository.create({ messageId: message.id, userId: OTHER_USER_ID, emoji: '🔥' });

    const summary = await reactionRepository.summarizeByMessageIds([message.id], AUTHOR_ID);

    expect(summary.get(message.id)).toEqual(
      expect.arrayContaining([
        { emoji: '👍', count: 2, reactedByCurrentUser: true },
        { emoji: '🔥', count: 1, reactedByCurrentUser: false },
      ]),
    );
  });

  it('deletes a single user reaction by message and emoji', async () => {
    const message = await messageRepository.create({
      roomId: ROOM_ID,
      authorId: AUTHOR_ID,
      content: 'Delete reaction',
      clientMessageId: 'reaction-delete',
    });

    await reactionRepository.create({ messageId: message.id, userId: AUTHOR_ID, emoji: '👍' });

    await expect(
      reactionRepository.deleteByMessageUserAndEmoji(message.id, AUTHOR_ID, '👍'),
    ).resolves.toBe(true);
    await expect(
      reactionRepository.findByMessageUserAndEmoji(message.id, AUTHOR_ID, '👍'),
    ).resolves.toBeNull();
  });
});
