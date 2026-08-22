import type { Server as HttpServer } from 'node:http';

import { Test, type TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import { API_ERROR_CODES, ROOM_TYPES } from '@pulse-chat/shared';

import { AppModule } from '../app.module.js';
import { configureApplication } from '../bootstrap/configure-application.js';
import { APP_INSTANCE_ID, AppConfigService } from '../config/index.js';
import { RedisService } from '../infrastructure/redis/redis.service.js';
import { REDIS_CLIENT } from '../infrastructure/tokens.js';
import { bearerAuthorization, registerTestUser } from '../test/auth-test.helpers.js';
import { startMongoMemoryServer, stopMongoMemoryServer } from '../test/mongo-memory.js';
import { TestRedisService } from '../test/test-redis.service.js';
import { RATE_LIMIT_ACTIONS, rateLimitKey } from './rate-limit.keys.js';
import { RATE_LIMIT_ERROR_MESSAGE } from './rate-limit.service.js';

interface RunningInstance {
  readonly moduleRef: TestingModule;
  readonly app: NestExpressApplication;
  readonly httpServer: HttpServer;
}

describe('Rate limiting across NestJS instances', () => {
  const redis = new TestRedisService().detachLifecycle();
  let instance1: RunningInstance;
  let instance2: RunningInstance;
  let config: AppConfigService;

  beforeAll(async () => {
    process.env['MONGODB_URI'] = await startMongoMemoryServer();
    instance1 = await bootInstance(redis, 'rate-limit-1');
    instance2 = await bootInstance(redis, 'rate-limit-2');
    config = instance1.moduleRef.get(AppConfigService);
    expect(instance1.moduleRef.get(REDIS_CLIENT)).toBe(redis);
    expect(instance2.moduleRef.get(REDIS_CLIENT)).toBe(redis);
  });

  afterAll(async () => {
    await instance1?.app.close();
    await instance1?.moduleRef.close();
    await instance2?.app.close();
    await instance2?.moduleRef.close();
    await redis.dispose();
    await stopMongoMemoryServer();
  });

  it('enforces one shared Redis counter across two API processes', async () => {
    const owner = await registerTestUser(instance1.httpServer, { username: 'rl_multi' });
    const roomId = await createPublicRoom(instance1.httpServer, owner.accessToken, 'Shared limit');
    const key = rateLimitKey(RATE_LIMIT_ACTIONS.MESSAGES, owner.userId);

    await request(instance1.httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ content: 'From instance 1', clientMessageId: 'rl-multi-1' })
      .expect(201);

    await redis.set(key, String(config.rateLimit.messages), config.rateLimit.messagesWindowSeconds);

    const blocked = await request(instance2.httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ content: 'From instance 2', clientMessageId: 'rl-multi-2' })
      .expect(429);

    expect(blocked.body).toMatchObject({
      statusCode: 429,
      code: API_ERROR_CODES.TOO_MANY_REQUESTS,
      message: RATE_LIMIT_ERROR_MESSAGE,
    });

    await redis.expire(key, 0);

    await request(instance2.httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ content: 'After shared reset', clientMessageId: 'rl-multi-3' })
      .expect(201);
  });
});

async function bootInstance(redis: TestRedisService, instanceId: string): Promise<RunningInstance> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(RedisService)
    .useValue(redis)
    .overrideProvider(REDIS_CLIENT)
    .useValue(redis)
    .overrideProvider(APP_INSTANCE_ID)
    .useValue(instanceId)
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApplication(app, app.get(AppConfigService));
  await app.listen(0);

  return {
    moduleRef,
    app,
    httpServer: app.getHttpServer(),
  };
}

async function createPublicRoom(
  httpServer: HttpServer,
  accessToken: string,
  name: string,
): Promise<string> {
  const response = await request(httpServer)
    .post('/api/rooms')
    .set(bearerAuthorization(accessToken))
    .send({ type: ROOM_TYPES.PUBLIC, name })
    .expect(201);

  return (response.body as { id: string }).id;
}
