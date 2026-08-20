import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import { AppModule } from '../app.module.js';
import { AppConfigService } from '../config/index.js';
import { RedisService } from '../infrastructure/redis/redis.service.js';
import { startMongoMemoryServer, stopMongoMemoryServer } from '../test/mongo-memory.js';
import { TestRedisService } from '../test/test-redis.service.js';
import { configureApplication } from './configure-application.js';

describe('application bootstrap', () => {
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

  it('starts the Nest application with validated configuration', () => {
    const config = app.get(AppConfigService);
    expect(config.nodeEnv).toBe('test');
    expect(config.port).toBe(3000);
  });

  it('serves liveness outside the /api prefix', async () => {
    await request(httpServer).get('/health/liveness').expect(200).expect({ status: 'ok' });
  });

  it('serves readiness with dependency checks', async () => {
    await request(httpServer)
      .get('/health/readiness')
      .expect(200)
      .expect({
        status: 'ok',
        checks: { mongodb: 'ok', redis: 'ok' },
      });
  });

  it('applies the /api prefix to REST routes', async () => {
    const response = await request(httpServer).get('/api/unknown-route');

    expect(response.status).toBe(404);
    const body = response.body as { statusCode: number; code: string; message: string };
    expect(body.statusCode).toBe(404);
    expect(typeof body.code).toBe('string');
    expect(typeof body.message).toBe('string');
  });

  it('propagates a correlation ID response header', async () => {
    const response = await request(httpServer).get('/health/liveness').expect(200);

    expect(response.headers['x-request-id']).toEqual(expect.any(String));
  });

  it('accepts an incoming correlation ID header', async () => {
    const response = await request(httpServer)
      .get('/health/liveness')
      .set('x-request-id', 'test-correlation-id')
      .expect(200);

    expect(response.headers['x-request-id']).toBe('test-correlation-id');
  });

  it('serves OpenAPI docs under /api/docs in non-production', async () => {
    const response = await request(httpServer).get('/api/docs');

    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(400);
  });
});
