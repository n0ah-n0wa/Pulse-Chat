import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type FilterQuery } from 'mongoose';

import { NOTIFICATION_PAGE_SIZE_MAX } from '@pulse-chat/shared';

import { isValidObjectId } from '../../common/validation/is-valid-object-id.js';
import type {
  CreateNotificationInput,
  FindNotificationsPageOptions,
  NotificationRecord,
  NotificationRepository,
} from '../notification.repository.interface.js';
import { NOTIFICATION_REPOSITORY } from '../notifications.tokens.js';
import {
  NotificationDocument,
  type NotificationDocumentHydrated,
} from './notification.schema.js';

function toNotificationRecord(document: NotificationDocumentHydrated): NotificationRecord {
  return {
    id: document._id.toHexString(),
    userId: document.userId.toHexString(),
    type: document.type,
    referenceId: document.referenceId.toHexString(),
    actorId: document.actorId.toHexString(),
    isRead: document.isRead,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

@Injectable()
export class MongooseNotificationRepository implements NotificationRepository {
  constructor(
    @InjectModel(NotificationDocument.name)
    private readonly model: Model<NotificationDocument>,
  ) {}

  async findOrCreate(
    input: CreateNotificationInput,
  ): Promise<{ record: NotificationRecord; created: boolean }> {
    const filter = {
      userId: new Types.ObjectId(input.userId),
      type: input.type,
      referenceId: new Types.ObjectId(input.referenceId),
      actorId: new Types.ObjectId(input.actorId),
    };

    const existing = await this.model.findOne(filter).exec();
    if (existing !== null) {
      return { record: toNotificationRecord(existing), created: false };
    }

    try {
      const created = await this.model.create({
        ...filter,
        isRead: false,
      });
      return { record: toNotificationRecord(created), created: true };
    } catch (error: unknown) {
      if (this.isDuplicateKeyError(error)) {
        const raced = await this.model.findOne(filter).exec();
        if (raced !== null) {
          return { record: toNotificationRecord(raced), created: false };
        }
      }
      throw error;
    }
  }

  async findPage(options: FindNotificationsPageOptions): Promise<NotificationRecord[]> {
    const limit = Math.min(options.limit, NOTIFICATION_PAGE_SIZE_MAX);
    const filter: FilterQuery<NotificationDocument> = {
      userId: new Types.ObjectId(options.userId),
    };

    if (options.before !== undefined) {
      filter.$or = [
        { createdAt: { $lt: options.before.createdAt } },
        {
          createdAt: options.before.createdAt,
          _id: { $lt: new Types.ObjectId(options.before.id) },
        },
      ];
    }

    const documents = await this.model
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .exec();

    return documents.map(toNotificationRecord);
  }

  async findById(id: string): Promise<NotificationRecord | null> {
    if (!isValidObjectId(id)) {
      return null;
    }

    const document = await this.model.findById(id).exec();
    return document === null ? null : toNotificationRecord(document);
  }

  async markRead(notificationId: string, userId: string): Promise<NotificationRecord | null> {
    if (!isValidObjectId(notificationId)) {
      return null;
    }

    const document = await this.model
      .findOneAndUpdate(
        { _id: new Types.ObjectId(notificationId), userId: new Types.ObjectId(userId) },
        { $set: { isRead: true } },
        { new: true },
      )
      .exec();

    return document === null ? null : toNotificationRecord(document);
  }

  async markAllRead(userId: string): Promise<void> {
    await this.model
      .updateMany({ userId: new Types.ObjectId(userId), isRead: false }, { $set: { isRead: true } })
      .exec();
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
  }
}

export const mongooseNotificationRepositoryProviders = [
  MongooseNotificationRepository,
  {
    provide: NOTIFICATION_REPOSITORY,
    useExisting: MongooseNotificationRepository,
  },
];
