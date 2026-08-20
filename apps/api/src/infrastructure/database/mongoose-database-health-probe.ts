import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';

import type { DatabaseHealthProbe } from './database-health-probe.interface.js';

@Injectable()
export class MongooseDatabaseHealthProbe implements DatabaseHealthProbe {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async ping(): Promise<void> {
    if (!this.connection.db) {
      throw new Error('MongoDB connection is not ready');
    }

    await this.connection.db.admin().command({ ping: 1 });
  }
}
