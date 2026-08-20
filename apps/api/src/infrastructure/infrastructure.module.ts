import { Module } from '@nestjs/common';

import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { HttpModule } from './http/http.module.js';
import { LoggingModule } from './logging/logging.module.js';
import { RedisModule } from './redis/redis.module.js';
import { StorageModule } from './storage/storage.module.js';

/**
 * Cross-cutting infrastructure: persistence, cache, logging and health probes.
 *
 * Feature modules should depend on the abstractions exported here rather than
 * on Mongoose models or ioredis clients directly.
 */
@Module({
  imports: [LoggingModule, DatabaseModule, RedisModule, HttpModule, HealthModule, StorageModule],
  exports: [LoggingModule, DatabaseModule, RedisModule, StorageModule],
})
export class InfrastructureModule {}
