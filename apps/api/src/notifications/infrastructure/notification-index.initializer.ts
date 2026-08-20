import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { NestStructuredLoggerService } from '../../infrastructure/logging/nest-structured-logger.service.js';
import { NotificationDocument } from './notification.schema.js';

@Injectable()
export class NotificationIndexInitializer implements OnModuleInit {
  constructor(
    @InjectModel(NotificationDocument.name)
    private readonly model: Model<NotificationDocument>,
    private readonly logger: NestStructuredLoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.model.createIndexes();
    } catch (error: unknown) {
      this.logger.error(
        'Failed to create notification indexes',
        error instanceof Error ? error.stack : undefined,
        NotificationIndexInitializer.name,
      );
    }
  }
}
