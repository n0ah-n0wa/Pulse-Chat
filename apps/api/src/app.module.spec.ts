import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from './app.module.js';
import { AppConfigService } from './config/index.js';
import { RedisService } from './infrastructure/redis/redis.service.js';
import { startMongoMemoryServer, stopMongoMemoryServer } from './test/mongo-memory.js';
import { TestRedisService } from './test/test-redis.service.js';

describe('AppModule', () => {
  beforeAll(async () => {
    process.env['MONGODB_URI'] = await startMongoMemoryServer();
  });

  afterAll(async () => {
    await stopMongoMemoryServer();
  });

  it('compiles the dependency graph', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RedisService)
      .useClass(TestRedisService)
      .compile();

    expect(moduleRef).toBeDefined();

    await moduleRef.close();
  });

  it('exposes validated configuration from the environment', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RedisService)
      .useClass(TestRedisService)
      .compile();
    const config = moduleRef.get(AppConfigService);

    expect(config.nodeEnv).toBe('test');
    expect(config.mongodbUri).toContain('mongodb://');
    expect(config.rateLimit.messages).toBe(1000);

    await moduleRef.close();
  });
});
