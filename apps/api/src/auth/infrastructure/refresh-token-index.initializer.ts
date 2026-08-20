import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { RefreshTokenDocument } from './refresh-token.schema.js';

/** Ensures MongoDB indexes for refresh-token sessions exist at startup. */
@Injectable()
export class RefreshTokenIndexInitializer implements OnModuleInit {
  constructor(
    @InjectModel(RefreshTokenDocument.name)
    private readonly refreshTokenModel: Model<RefreshTokenDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.refreshTokenModel.syncIndexes();
  }
}
