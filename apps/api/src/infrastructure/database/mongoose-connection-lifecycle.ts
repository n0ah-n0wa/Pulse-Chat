import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';

/** Closes the shared Mongoose connection during Nest shutdown. */
@Injectable()
export class MongooseConnectionLifecycle implements OnModuleDestroy {
  private readonly logger = new Logger(MongooseConnectionLifecycle.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  async onModuleDestroy(): Promise<void> {
    await this.connection.close();
    this.logger.log('MongoDB connection closed');
  }
}
