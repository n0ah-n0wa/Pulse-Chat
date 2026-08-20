import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import { API_ERROR_CODES } from '@pulse-chat/shared';

import { AppModule } from '../app.module.js';
import { configureApplication } from '../bootstrap/configure-application.js';
import { AppConfigService } from '../config/index.js';
import { RedisService } from '../infrastructure/redis/redis.service.js';
import { bearerAuthorization, registerTestUser } from '../test/auth-test.helpers.js';
import { startMongoMemoryServer, stopMongoMemoryServer } from '../test/mongo-memory.js';
import { TestRedisService } from '../test/test-redis.service.js';

describe('UsersController', () => {
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

    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApplication(app, app.get(AppConfigService));
    await app.init();
    httpServer = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app?.close();
    await moduleRef?.close();
    await stopMongoMemoryServer();
  });

  it('GET /api/users/:id returns a public profile without sensitive fields', async () => {
    const session = await registerTestUser(httpServer, {
      username: 'public_profile',
      email: 'public_profile@example.com',
      displayName: 'Public Profile',
    });

    const response = await request(httpServer).get(`/api/users/${session.userId}`).expect(200);

    expect(response.body).toMatchObject({
      id: session.userId,
      username: 'public_profile',
      displayName: 'Public Profile',
      role: 'USER',
    });
    expect(response.body).not.toHaveProperty('email');
    expect(response.body).not.toHaveProperty('passwordHash');
    expect(response.body).not.toHaveProperty('_id');
  });

  it('PATCH /api/users/me requires authentication', async () => {
    const response = await request(httpServer)
      .patch('/api/users/me')
      .send({ displayName: 'Denied' })
      .expect(401);

    expect(response.body).toMatchObject({
      statusCode: 401,
      code: API_ERROR_CODES.UNAUTHORIZED,
    });
  });

  it('PATCH /api/users/me updates the authenticated profile', async () => {
    const session = await registerTestUser(httpServer, {
      username: 'self_user',
      email: 'self@example.com',
      displayName: 'Original',
    });

    const response = await request(httpServer)
      .patch('/api/users/me')
      .set(bearerAuthorization(session.accessToken))
      .send({ displayName: 'Updated Name', bio: 'New bio' })
      .expect(200);

    expect(response.body).toMatchObject({
      id: session.userId,
      username: 'self_user',
      email: 'self@example.com',
      displayName: 'Updated Name',
      bio: 'New bio',
      role: 'USER',
    });
    expect(response.body).not.toHaveProperty('passwordHash');
    expect(response.body).not.toHaveProperty('_id');
  });

  it('PATCH /api/users/me validates the request body', async () => {
    const session = await registerTestUser(httpServer);

    const response = await request(httpServer)
      .patch('/api/users/me')
      .set(bearerAuthorization(session.accessToken))
      .send({})
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      code: API_ERROR_CODES.VALIDATION_FAILED,
    });
  });
});
