import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { isValidObjectId } from '../../common/validation/is-valid-object-id.js';
import { objectIdToString } from '../../messages/utils/object-id.js';
import type {
  AttachmentRecord,
  AttachmentRepository,
  CreateAttachmentRecordInput,
} from '../attachment.repository.interface.js';
import { ATTACHMENT_REPOSITORY } from '../attachments.tokens.js';
import { AttachmentDocument } from './attachment.schema.js';

function toAttachmentRecord(document: {
  readonly _id: Types.ObjectId;
  readonly roomId: Types.ObjectId;
  readonly uploaderId: Types.ObjectId;
  readonly storageKey: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly messageId?: Types.ObjectId | null;
  readonly deletedAt?: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}): AttachmentRecord {
  return {
    id: document._id.toHexString(),
    roomId: objectIdToString(document.roomId),
    uploaderId: objectIdToString(document.uploaderId),
    storageKey: document.storageKey,
    filename: document.filename,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    messageId:
      document.messageId === undefined || document.messageId === null
        ? undefined
        : objectIdToString(document.messageId),
    deletedAt: document.deletedAt,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

@Injectable()
export class MongooseAttachmentRepository implements AttachmentRepository {
  constructor(
    @InjectModel(AttachmentDocument.name)
    private readonly attachmentModel: Model<AttachmentDocument>,
  ) {}

  async create(input: CreateAttachmentRecordInput): Promise<AttachmentRecord> {
    const document = await this.attachmentModel.create({
      roomId: new Types.ObjectId(input.roomId),
      uploaderId: new Types.ObjectId(input.uploaderId),
      storageKey: input.storageKey,
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
    });

    return toAttachmentRecord(document);
  }

  async findById(id: string): Promise<AttachmentRecord | null> {
    if (!isValidObjectId(id)) {
      return null;
    }

    const document = await this.attachmentModel.findById(id).lean().exec();
    return document ? toAttachmentRecord(document) : null;
  }

  async findByIds(ids: readonly string[]): Promise<AttachmentRecord[]> {
    const validIds = ids.filter((id) => isValidObjectId(id)).map((id) => new Types.ObjectId(id));
    if (validIds.length === 0) {
      return [];
    }

    const documents = await this.attachmentModel
      .find({ _id: { $in: validIds } })
      .lean()
      .exec();
    return documents.map((document) => toAttachmentRecord(document));
  }

  async findByStorageKey(storageKey: string): Promise<AttachmentRecord | null> {
    const document = await this.attachmentModel.findOne({ storageKey }).lean().exec();
    return document ? toAttachmentRecord(document) : null;
  }

  async linkToMessage(ids: readonly string[], messageId: string): Promise<boolean> {
    const validIds = ids.filter((id) => isValidObjectId(id)).map((id) => new Types.ObjectId(id));
    if (validIds.length === 0) {
      return true;
    }

    const messageObjectId = new Types.ObjectId(messageId);
    const claimed: Types.ObjectId[] = [];

    for (const id of validIds) {
      const document = await this.attachmentModel
        .findOneAndUpdate(
          {
            _id: id,
            messageId: { $exists: false },
            deletedAt: { $exists: false },
          },
          { $set: { messageId: messageObjectId } },
          { new: true },
        )
        .exec();

      if (document === null) {
        if (claimed.length > 0) {
          await this.attachmentModel
            .updateMany({ _id: { $in: claimed } }, { $unset: { messageId: 1 } })
            .exec();
        }

        return false;
      }

      claimed.push(id);
    }

    return true;
  }

  async softDelete(id: string, deletedAt: Date): Promise<AttachmentRecord | null> {
    if (!isValidObjectId(id)) {
      return null;
    }

    const document = await this.attachmentModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), deletedAt: { $exists: false } },
        { $set: { deletedAt } },
        { new: true },
      )
      .exec();

    return document ? toAttachmentRecord(document) : null;
  }
}

export const mongooseAttachmentRepositoryProviders = [
  MongooseAttachmentRepository,
  {
    provide: ATTACHMENT_REPOSITORY,
    useExisting: MongooseAttachmentRepository,
  },
] as const;
