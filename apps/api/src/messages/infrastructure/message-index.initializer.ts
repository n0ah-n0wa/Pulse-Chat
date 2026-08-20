import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { MessageDocument } from './message.schema.js';
import { MessageReactionDocument } from './message-reaction.schema.js';

/** Ensures MongoDB indexes for messages exist at startup. */
@Injectable()
export class MessageIndexInitializer implements OnModuleInit {
  constructor(
    @InjectModel(MessageDocument.name) private readonly messageModel: Model<MessageDocument>,
    @InjectModel(MessageReactionDocument.name)
    private readonly reactionModel: Model<MessageReactionDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    await Promise.all([this.messageModel.syncIndexes(), this.reactionModel.syncIndexes()]);
  }
}
