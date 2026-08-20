import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { ROOM_TYPES } from '@pulse-chat/shared';

import type {
  CreateRoomRecordInput,
  RoomRecord,
  RoomRepository,
  UpdateRoomRecordInput,
} from '../room.repository.interface.js';
import { ROOM_REPOSITORY } from '../rooms.tokens.js';
import { objectIdToString } from '../utils/object-id.js';
import { RoomDocument, type RoomDocumentHydrated } from './room.schema.js';

function toRoomRecord(document: RoomDocumentHydrated): RoomRecord {
  return {
    id: document._id.toHexString(),
    name: document.name === undefined || document.name.length === 0 ? undefined : document.name,
    description:
      document.description === undefined || document.description.length === 0
        ? undefined
        : document.description,
    type: document.type,
    ownerId:
      document.ownerId === undefined || document.ownerId === null
        ? undefined
        : objectIdToString(document.ownerId),
    directKey: document.directKey,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

@Injectable()
export class MongooseRoomRepository implements RoomRepository {
  constructor(@InjectModel(RoomDocument.name) private readonly roomModel: Model<RoomDocument>) {}

  async create(input: CreateRoomRecordInput): Promise<RoomRecord> {
    const document = await this.roomModel.create({
      name: input.name,
      description: input.description,
      type: input.type,
      ownerId: input.ownerId === undefined ? undefined : new Types.ObjectId(input.ownerId),
      directKey: input.directKey,
    });

    return toRoomRecord(document);
  }

  async findById(id: string): Promise<RoomRecord | null> {
    const document = await this.roomModel.findById(id).exec();
    return document ? toRoomRecord(document) : null;
  }

  async findByIds(ids: readonly string[]): Promise<RoomRecord[]> {
    if (ids.length === 0) {
      return [];
    }

    const documents = await this.roomModel
      .find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } })
      .exec();

    return documents.map((document) => toRoomRecord(document));
  }

  async findPublic(): Promise<RoomRecord[]> {
    const documents = await this.roomModel.find({ type: ROOM_TYPES.PUBLIC }).exec();
    return documents.map((document) => toRoomRecord(document));
  }

  async findByDirectKey(directKey: string): Promise<RoomRecord | null> {
    const document = await this.roomModel.findOne({ directKey }).exec();
    return document ? toRoomRecord(document) : null;
  }

  async update(id: string, update: UpdateRoomRecordInput): Promise<RoomRecord | null> {
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, 1> = {};

    if (update.name !== undefined) {
      $set['name'] = update.name;
    }
    if (update.description !== undefined) {
      $set['description'] = update.description;
    }
    if (update.ownerId === null) {
      $unset['ownerId'] = 1;
    } else if (update.ownerId !== undefined) {
      $set['ownerId'] = new Types.ObjectId(update.ownerId);
    }

    const document = await this.roomModel
      .findByIdAndUpdate(
        id,
        {
          ...(Object.keys($set).length > 0 ? { $set } : {}),
          ...(Object.keys($unset).length > 0 ? { $unset } : {}),
        },
        { new: true, runValidators: true },
      )
      .exec();

    return document ? toRoomRecord(document) : null;
  }

  async deleteById(id: string): Promise<void> {
    await this.roomModel.deleteOne({ _id: new Types.ObjectId(id) }).exec();
  }
}

export const mongooseRoomRepositoryProviders = [
  MongooseRoomRepository,
  {
    provide: ROOM_REPOSITORY,
    useExisting: MongooseRoomRepository,
  },
] as const;
