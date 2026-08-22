import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import { API_ERROR_CODES, USER_ERROR_CODES } from '@pulse-chat/shared';

import { AppModule } from '../app.module.js';
import { configureApplication } from '../bootstrap/configure-application.js';
import { AppConfigService } from '../config/index.js';
import { RedisService } from '../infrastructure/redis/redis.service.js';
import { bearerAuthorization, registerTestUser } from '../test/auth-test.helpers.js';
import { startMongoMemoryServer, stopMongoMemoryServer } from '../test/mongo-memory.js';
import { TestRedisService } from '../test/test-redis.service.js';

const PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

describe('UsersController', () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  let httpServer: Server;

  beforeAll(async () => {
    const storageDir = await mkdtemp(path.join(os.tmpdir(), 'pulse-avatar-tests-'));
    process.env['MONGODB_URI'] = await startMongoMemoryServer();
    process.env['FILE_STORAGE_PROVIDER'] = 'local';
    process.env['FILE_STORAGE_PATH'] = storageDir;

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

  it('GET /api/users/username/:username returns a public profile without email', async () => {
    const session = await registerTestUser(httpServer, {
      username: 'by_username',
      email: 'by_username@example.com',
      displayName: 'By Username',
    });

    const response = await request(httpServer).get('/api/users/username/by_username').expect(200);

    expect(response.body).toMatchObject({
      id: session.userId,
      username: 'by_username',
      displayName: 'By Username',
    });
    expect(response.body).not.toHaveProperty('email');
    expect(response.body).not.toHaveProperty('passwordHash');
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

  it('PATCH /api/users/me allows a unique username change', async () => {
    const session = await registerTestUser(httpServer, {
      username: 'rename_me',
      email: 'rename_me@example.com',
      displayName: 'Rename Me',
    });

    const response = await request(httpServer)
      .patch('/api/users/me')
      .set(bearerAuthorization(session.accessToken))
      .send({ username: 'renamed_user' })
      .expect(200);

    expect(response.body).toMatchObject({
      id: session.userId,
      username: 'renamed_user',
    });
  });

  it('PATCH /api/users/me rejects a taken username', async () => {
    await registerTestUser(httpServer, {
      username: 'already_taken',
      email: 'already_taken@example.com',
    });
    const session = await registerTestUser(httpServer, {
      username: 'wants_taken',
      email: 'wants_taken@example.com',
    });

    const response = await request(httpServer)
      .patch('/api/users/me')
      .set(bearerAuthorization(session.accessToken))
      .send({ username: 'already_taken' })
      .expect(409);

    expect(response.body).toMatchObject({
      code: USER_ERROR_CODES.USERNAME_ALREADY_TAKEN,
    });
  });

  it('POST /api/users/me/avatar stores an image and serves it without email', async () => {
    const session = await registerTestUser(httpServer, {
      username: 'avatar_user',
      email: 'avatar_user@example.com',
      displayName: 'Avatar User',
    });

    const uploaded = await request(httpServer)
      .post('/api/users/me/avatar')
      .set(bearerAuthorization(session.accessToken))
      .attach('file', PNG_BUFFER, 'face.png')
      .expect(201);

    expect(uploaded.body).toMatchObject({
      id: session.userId,
      username: 'avatar_user',
      avatarUrl: `/api/users/${session.userId}/avatar`,
    });
    expect(uploaded.body).not.toHaveProperty('passwordHash');

    const served = await request(httpServer).get(`/api/users/${session.userId}/avatar`).expect(200);

    expect(served.headers['content-type']).toMatch(/image\/png/);
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
