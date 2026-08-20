import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { UserDocument } from './user.schema.js';

/** Ensures MongoDB indexes for the users collection exist at startup. */
@Injectable()
export class UserIndexInitializer implements OnModuleInit {
  constructor(@InjectModel(UserDocument.name) private readonly userModel: Model<UserDocument>) {}

  async onModuleInit(): Promise<void> {
    await this.userModel.syncIndexes();
  }
}
