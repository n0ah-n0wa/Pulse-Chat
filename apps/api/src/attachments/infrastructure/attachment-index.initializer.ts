import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { AttachmentDocument } from './attachment.schema.js';

/** Ensures MongoDB indexes for attachments exist at startup. */
@Injectable()
export class AttachmentIndexInitializer implements OnModuleInit {
  constructor(
    @InjectModel(AttachmentDocument.name)
    private readonly attachmentModel: Model<AttachmentDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.attachmentModel.syncIndexes();
  }
}
