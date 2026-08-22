import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';

import { StructuredLoggerService } from '../logging/structured-logger.service.js';

/** Binds MongoDB connection diagnostics and closes the client on Nest shutdown. */
@Injectable()
export class MongooseConnectionLifecycle implements OnModuleInit, OnModuleDestroy {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly logger: StructuredLoggerService,
  ) {}

  onModuleInit(): void {
    this.connection.on('connected', () => {
      this.logger.log('mongodb.connected');
    });
    this.connection.on('reconnected', () => {
      this.logger.log('mongodb.reconnected');
    });
    this.connection.on('disconnected', () => {
      this.logger.warn('mongodb.disconnected');
    });
    this.connection.on('error', (error: Error) => {
      this.logger.error('mongodb.error', { error });
    });

    if (this.connection.db) {
      this.logger.log('mongodb.connected');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.connection.close();
  }
}
