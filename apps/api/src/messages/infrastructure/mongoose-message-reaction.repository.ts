import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import type {
  CreateMessageReactionInput,
  MessageReactionRecord,
  MessageReactionRepository,
  MessageReactionSummaryRecord,
} from '../message.repository.interface.js';
import { MESSAGE_REACTION_REPOSITORY } from '../messages.tokens.js';
import { objectIdToString } from '../utils/object-id.js';
import {
  MessageReactionDocument,
  type MessageReactionDocumentHydrated,
} from './message-reaction.schema.js';

function toReactionRecord(document: MessageReactionDocumentHydrated): MessageReactionRecord {
  return {
    id: document._id.toHexString(),
    messageId: objectIdToString(document.messageId),
    userId: objectIdToString(document.userId),
    emoji: document.emoji,
    createdAt: document.createdAt,
  };
}

@Injectable()
export class MongooseMessageReactionRepository implements MessageReactionRepository {
  constructor(
    @InjectModel(MessageReactionDocument.name)
    private readonly reactionModel: Model<MessageReactionDocument>,
  ) {}

  async create(input: CreateMessageReactionInput): Promise<MessageReactionRecord> {
    const document = await this.reactionModel.create({
      messageId: new Types.ObjectId(input.messageId),
      userId: new Types.ObjectId(input.userId),
      emoji: input.emoji,
      createdAt: new Date(),
    });

    return toReactionRecord(document);
  }

  async deleteByMessageUserAndEmoji(
    messageId: string,
    userId: string,
    emoji: string,
  ): Promise<boolean> {
    const result = await this.reactionModel
      .deleteOne({
        messageId: new Types.ObjectId(messageId),
        userId: new Types.ObjectId(userId),
        emoji,
      })
      .exec();

    return result.deletedCount === 1;
  }

  async findByMessageUserAndEmoji(
    messageId: string,
    userId: string,
    emoji: string,
  ): Promise<MessageReactionRecord | null> {
    const document = await this.reactionModel
      .findOne({
        messageId: new Types.ObjectId(messageId),
        userId: new Types.ObjectId(userId),
        emoji,
      })
      .exec();

    return document ? toReactionRecord(document) : null;
  }

  async summarizeByMessageIds(
    messageIds: readonly string[],
    currentUserId: string,
  ): Promise<Map<string, MessageReactionSummaryRecord[]>> {
    if (messageIds.length === 0) {
      return new Map<string, MessageReactionSummaryRecord[]>();
    }

    const currentUserObjectId = new Types.ObjectId(currentUserId);
    const summaries = await this.reactionModel
      .aggregate<{
        _id: Types.ObjectId;
        reactions: MessageReactionSummaryRecord[];
      }>([
        {
          $match: {
            messageId: {
              $in: messageIds.map((messageId) => new Types.ObjectId(messageId)),
            },
          },
        },
        {
          $group: {
            _id: {
              messageId: '$messageId',
              emoji: '$emoji',
            },
            count: { $sum: 1 },
            reactedByCurrentUser: {
              $max: {
                $cond: [{ $eq: ['$userId', currentUserObjectId] }, 1, 0],
              },
            },
          },
        },
        { $sort: { '_id.emoji': 1 } },
        {
          $group: {
            _id: '$_id.messageId',
            reactions: {
              $push: {
                emoji: '$_id.emoji',
                count: '$count',
                reactedByCurrentUser: { $toBool: '$reactedByCurrentUser' },
              },
            },
          },
        },
      ])
      .exec();

    return new Map<string, MessageReactionSummaryRecord[]>(
      summaries.map((summary) => [objectIdToString(summary._id), summary.reactions]),
    );
  }
}

export const mongooseMessageReactionRepositoryProviders = [
  MongooseMessageReactionRepository,
  {
    provide: MESSAGE_REACTION_REPOSITORY,
    useExisting: MongooseMessageReactionRepository,
  },
] as const;
