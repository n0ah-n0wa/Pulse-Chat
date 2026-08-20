import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, it } from 'vitest';
import request from 'supertest';

import { AppModule } from '../../app.module.js';
import { configureApplication } from '../../bootstrap/configure-application.js';
import { AppConfigService } from '../../config/index.js';
import { RedisService } from '../redis/redis.service.js';
import { startMongoMemoryServer, stopMongoMemoryServer } from '../../test/mongo-memory.js';
import { TestRedisService } from '../../test/test-redis.service.js';

describe('HealthController', () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  let httpServer: Server;

  beforeAll(async () => {
    process.env['MONGODB_URI'] = await startMongoMemoryServer();

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RedisService)
      .useClass(TestRedisService)
      .compile();

    app = moduleRef.createNestApplication();
    configureApplication(app, app.get(AppConfigService));
    await app.init();
    httpServer = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app?.close();
    await moduleRef?.close();
    await stopMongoMemoryServer();
  });

  it('GET /health returns aggregate dependency status', async () => {
    await request(httpServer)
      .get('/health')
      .expect(200)
      .expect({
        status: 'ok',
        checks: { mongodb: 'ok', redis: 'ok' },
      });
  });

  it('GET /health/liveness returns ok without dependency checks', async () => {
    await request(httpServer).get('/health/liveness').expect(200).expect({ status: 'ok' });
  });
});
