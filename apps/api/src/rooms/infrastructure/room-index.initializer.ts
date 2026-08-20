import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { RoomMemberDocument } from './room-member.schema.js';
import { RoomDocument } from './room.schema.js';

/** Ensures MongoDB indexes for rooms and memberships exist at startup. */
@Injectable()
export class RoomIndexInitializer implements OnModuleInit {
  constructor(
    @InjectModel(RoomDocument.name) private readonly roomModel: Model<RoomDocument>,
    @InjectModel(RoomMemberDocument.name)
    private readonly roomMemberModel: Model<RoomMemberDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    await Promise.all([this.roomModel.syncIndexes(), this.roomMemberModel.syncIndexes()]);
  }
}
