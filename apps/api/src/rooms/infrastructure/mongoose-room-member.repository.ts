import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import type { MembershipRole } from '@pulse-chat/shared';

import type {
  CreateRoomMemberRecordInput,
  RoomMemberRecord,
  RoomMemberRepository,
} from '../room-member.repository.interface.js';
import { ROOM_MEMBER_REPOSITORY } from '../rooms.tokens.js';
import { objectIdToString } from '../utils/object-id.js';
import { RoomMemberDocument, type RoomMemberDocumentHydrated } from './room-member.schema.js';

function toRoomMemberRecord(document: RoomMemberDocumentHydrated): RoomMemberRecord {
  return {
    id: document._id.toHexString(),
    roomId: objectIdToString(document.roomId),
    userId: objectIdToString(document.userId),
    role: document.role,
    joinedAt: document.joinedAt,
    lastReadMessageId: document.lastReadMessageId,
    lastReadAt: document.lastReadAt,
  };
}

@Injectable()
export class MongooseRoomMemberRepository implements RoomMemberRepository {
  constructor(
    @InjectModel(RoomMemberDocument.name)
    private readonly roomMemberModel: Model<RoomMemberDocument>,
  ) {}

  async create(input: CreateRoomMemberRecordInput): Promise<RoomMemberRecord> {
    const document = await this.roomMemberModel.create({
      roomId: new Types.ObjectId(input.roomId),
      userId: new Types.ObjectId(input.userId),
      role: input.role,
      joinedAt: new Date(),
    });

    return toRoomMemberRecord(document);
  }

  async findByRoomAndUser(roomId: string, userId: string): Promise<RoomMemberRecord | null> {
    const document = await this.roomMemberModel
      .findOne({
        roomId: new Types.ObjectId(roomId),
        userId: new Types.ObjectId(userId),
      })
      .exec();

    return document ? toRoomMemberRecord(document) : null;
  }

  async findByRoomId(roomId: string): Promise<RoomMemberRecord[]> {
    const documents = await this.roomMemberModel
      .find({ roomId: new Types.ObjectId(roomId) })
      .exec();

    return documents.map((document) => toRoomMemberRecord(document));
  }

  async findByUserId(userId: string): Promise<RoomMemberRecord[]> {
    const documents = await this.roomMemberModel
      .find({ userId: new Types.ObjectId(userId) })
      .exec();

    return documents.map((document) => toRoomMemberRecord(document));
  }

  async updateRole(
    roomId: string,
    userId: string,
    role: MembershipRole,
  ): Promise<RoomMemberRecord | null> {
    const document = await this.roomMemberModel
      .findOneAndUpdate(
        {
          roomId: new Types.ObjectId(roomId),
          userId: new Types.ObjectId(userId),
        },
        { $set: { role } },
        { new: true },
      )
      .exec();

    return document ? toRoomMemberRecord(document) : null;
  }

  async updateReadState(
    roomId: string,
    userId: string,
    messageId: string,
  ): Promise<RoomMemberRecord | null> {
    const document = await this.roomMemberModel
      .findOneAndUpdate(
        {
          roomId: new Types.ObjectId(roomId),
          userId: new Types.ObjectId(userId),
        },
        {
          $set: {
            lastReadMessageId: messageId,
            lastReadAt: new Date(),
          },
        },
        { new: true },
      )
      .exec();

    return document ? toRoomMemberRecord(document) : null;
  }

  async deleteByRoomAndUser(roomId: string, userId: string): Promise<boolean> {
    const result = await this.roomMemberModel
      .deleteOne({
        roomId: new Types.ObjectId(roomId),
        userId: new Types.ObjectId(userId),
      })
      .exec();

    return result.deletedCount > 0;
  }

  async deleteByRoomId(roomId: string): Promise<void> {
    await this.roomMemberModel.deleteMany({ roomId: new Types.ObjectId(roomId) }).exec();
  }

  async countByRoomId(roomId: string): Promise<number> {
    return this.roomMemberModel.countDocuments({ roomId: new Types.ObjectId(roomId) }).exec();
  }
}

export const mongooseRoomMemberRepositoryProviders = [
  MongooseRoomMemberRepository,
  {
    provide: ROOM_MEMBER_REPOSITORY,
    useExisting: MongooseRoomMemberRepository,
  },
] as const;
