import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type FilterQuery } from 'mongoose';

import { MESSAGE_PAGE_SIZE_MAX } from '@pulse-chat/shared';

import { isValidObjectId } from '../../common/validation/is-valid-object-id.js';
import type {
  CreateMessageRecordInput,
  MessagePageQuery,
  MessageRecord,
  MessageRepository,
  MessageSearchPageQuery,
} from '../message.repository.interface.js';
import { MESSAGE_REPOSITORY } from '../messages.tokens.js';
import { objectIdToString } from '../utils/object-id.js';
import { MessageDocument, type MessageDocumentHydrated } from './message.schema.js';

function toMessageRecord(document: MessageDocumentHydrated): MessageRecord {
  return {
    id: document._id.toHexString(),
    roomId: objectIdToString(document.roomId),
    authorId: objectIdToString(document.authorId),
    content: document.content,
    clientMessageId: document.clientMessageId,
    replyToMessageId:
      document.replyToMessageId === undefined || document.replyToMessageId === null
        ? undefined
        : objectIdToString(document.replyToMessageId),
    attachments: (document.attachments ?? []).map((attachment) => ({ id: attachment.id })),
    editedAt: document.editedAt,
    deletedAt: document.deletedAt,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

@Injectable()
export class MongooseMessageRepository implements MessageRepository {
  constructor(
    @InjectModel(MessageDocument.name) private readonly messageModel: Model<MessageDocument>,
  ) {}

  async create(input: CreateMessageRecordInput): Promise<MessageRecord> {
    const document = await this.messageModel.create({
      roomId: new Types.ObjectId(input.roomId),
      authorId: new Types.ObjectId(input.authorId),
      content: input.content,
      clientMessageId: input.clientMessageId,
      replyToMessageId:
        input.replyToMessageId === undefined
          ? undefined
          : new Types.ObjectId(input.replyToMessageId),
      attachments: (input.attachmentIds ?? []).map((id) => ({ id })),
    });

    return toMessageRecord(document);
  }

  async findById(id: string): Promise<MessageRecord | null> {
    if (!isValidObjectId(id)) {
      return null;
    }

    const document = await this.messageModel.findById(id).exec();
    return document ? toMessageRecord(document) : null;
  }

  async findByClientMessageId(
    roomId: string,
    authorId: string,
    clientMessageId: string,
  ): Promise<MessageRecord | null> {
    const document = await this.messageModel
      .findOne({
        roomId: new Types.ObjectId(roomId),
        authorId: new Types.ObjectId(authorId),
        clientMessageId,
      })
      .exec();

    return document ? toMessageRecord(document) : null;
  }

  async findByIds(ids: readonly string[]): Promise<MessageRecord[]> {
    const validIds = ids.filter((id) => isValidObjectId(id)).map((id) => new Types.ObjectId(id));
    if (validIds.length === 0) {
      return [];
    }

    const documents = await this.messageModel.find({ _id: { $in: validIds } }).exec();
    return documents.map((document) => toMessageRecord(document));
  }

  async findPage(query: MessagePageQuery): Promise<MessageRecord[]> {
    const limit = Math.min(Math.max(1, query.limit), MESSAGE_PAGE_SIZE_MAX + 1);
    const filter: FilterQuery<MessageDocument> = {
      roomId: new Types.ObjectId(query.roomId),
    };

    if (query.before !== undefined) {
      filter.$or = [
        { createdAt: { $lt: query.before.createdAt } },
        {
          createdAt: query.before.createdAt,
          _id: { $lt: new Types.ObjectId(query.before.id) },
        },
      ];
    }

    const documents = await this.messageModel
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .exec();

    return documents.map((document) => toMessageRecord(document));
  }

  /**
   * Full-text search scoped to a single room via the compound
   * `{ roomId, content: text }` index. The mandatory `roomId` equality filter
   * keeps scans bounded to one room instead of the whole collection.
   */
  async searchPage(query: MessageSearchPageQuery): Promise<MessageRecord[]> {
    const limit = Math.min(Math.max(1, query.limit), MESSAGE_PAGE_SIZE_MAX + 1);
    const filter: FilterQuery<MessageDocument> = {
      roomId: new Types.ObjectId(query.roomId),
      deletedAt: { $exists: false },
      $text: { $search: query.searchText },
    };

    if (query.before !== undefined) {
      filter.$and = [
        {
          $or: [
            { createdAt: { $lt: query.before.createdAt } },
            {
              createdAt: query.before.createdAt,
              _id: { $lt: new Types.ObjectId(query.before.id) },
            },
          ],
        },
      ];
    }

    const documents = await this.messageModel
      .find(filter, { score: { $meta: 'textScore' } })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .exec();

    return documents.map((document) => toMessageRecord(document));
  }

  async updateContent(id: string, content: string, editedAt: Date): Promise<MessageRecord | null> {
    if (!isValidObjectId(id)) {
      return null;
    }

    const document = await this.messageModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), deletedAt: { $exists: false } },
        { $set: { content, editedAt } },
        { new: true, runValidators: true },
      )
      .exec();

    return document ? toMessageRecord(document) : null;
  }

  async softDelete(id: string, deletedAt: Date): Promise<MessageRecord | null> {
    if (!isValidObjectId(id)) {
      return null;
    }

    const document = await this.messageModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), deletedAt: { $exists: false } },
        { $set: { deletedAt } },
        { new: true },
      )
      .exec();

    return document ? toMessageRecord(document) : null;
  }

  async removeAttachmentReference(messageId: string, attachmentId: string): Promise<void> {
    if (!isValidObjectId(messageId)) {
      return;
    }

    await this.messageModel
      .updateOne(
        { _id: new Types.ObjectId(messageId) },
        { $pull: { attachments: { id: attachmentId } } },
      )
      .exec();
  }
}

export const mongooseMessageRepositoryProviders = [
  MongooseMessageRepository,
  {
    provide: MESSAGE_REPOSITORY,
    useExisting: MongooseMessageRepository,
  },
] as const;
