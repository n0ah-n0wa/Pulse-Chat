import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import {
  API_ERROR_CODES,
  MESSAGE_SEARCH_QUERY_MAX_LENGTH,
  ROOM_ERROR_CODES,
  ROOM_TYPES,
  type MessageResponse,
  type MessageSearchListResponse,
} from '@pulse-chat/shared';

import { AppModule } from '../app.module.js';
import { configureApplication } from '../bootstrap/configure-application.js';
import { AppConfigService } from '../config/index.js';
import { RedisService } from '../infrastructure/redis/redis.service.js';
import { bearerAuthorization, registerTestUser } from '../test/auth-test.helpers.js';
import { startMongoMemoryServer, stopMongoMemoryServer } from '../test/mongo-memory.js';
import { TestRedisService } from '../test/test-redis.service.js';

function createdId(body: unknown): string {
  return (body as { id: string }).id;
}

async function createMessage(
  httpServer: Server,
  token: string,
  roomId: string,
  content: string,
  clientMessageId: string,
): Promise<MessageResponse> {
  const response = await request(httpServer)
    .post(`/api/rooms/${roomId}/messages`)
    .set(bearerAuthorization(token))
    .send({ content, clientMessageId })
    .expect(201);

  return response.body as MessageResponse;
}

describe('Message search (GET /api/rooms/:roomId/messages/search)', () => {
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

  it('returns matching messages with author and timestamp for room members', async () => {
    const author = await registerTestUser(httpServer, {
      username: 'search_author',
      displayName: 'Search Author',
    });

    const room = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(author.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Search Room' })
      .expect(201);
    const roomId = createdId(room.body);

    const created = await createMessage(
      httpServer,
      author.accessToken,
      roomId,
      'Plan the deployment rollout for Friday',
      'search-hit-1',
    );

    const response = await request(httpServer)
      .get(`/api/rooms/${roomId}/messages/search`)
      .query({ q: 'deployment' })
      .set(bearerAuthorization(author.accessToken))
      .expect(200);

    const body = response.body as MessageSearchListResponse;
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      message: {
        id: created.id,
        content: 'Plan the deployment rollout for Friday',
      },
      author: {
        id: author.userId,
        username: 'search_author',
        displayName: 'Search Author',
      },
    });
    expect(body.items[0]?.matchingContext).toContain('deployment');
    expect(typeof body.items[0]?.message.createdAt).toBe('string');
    expect(body.nextCursor).toBeUndefined();
  });

  it('rejects an empty search query', async () => {
    const member = await registerTestUser(httpServer, { username: 'search_empty' });
    const room = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(member.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Empty Search' })
      .expect(201);
    const roomId = createdId(room.body);

    const response = await request(httpServer)
      .get(`/api/rooms/${roomId}/messages/search`)
      .query({ q: '' })
      .set(bearerAuthorization(member.accessToken))
      .expect(400);

    expect(response.body).toMatchObject({ code: API_ERROR_CODES.VALIDATION_FAILED });
  });

  it('rejects an oversized search query', async () => {
    const member = await registerTestUser(httpServer, { username: 'search_oversized' });
    const room = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(member.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Oversized Search' })
      .expect(201);
    const roomId = createdId(room.body);

    const response = await request(httpServer)
      .get(`/api/rooms/${roomId}/messages/search`)
      .query({ q: 'x'.repeat(MESSAGE_SEARCH_QUERY_MAX_LENGTH + 1) })
      .set(bearerAuthorization(member.accessToken))
      .expect(400);

    expect(response.body).toMatchObject({ code: API_ERROR_CODES.VALIDATION_FAILED });
  });

  it('rejects search from users who are not room members', async () => {
    const owner = await registerTestUser(httpServer, { username: 'search_owner' });
    const outsider = await registerTestUser(httpServer, { username: 'search_outsider' });

    const room = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Private Search' })
      .expect(201);
    const roomId = createdId(room.body);

    await createMessage(httpServer, owner.accessToken, roomId, 'deployment notes', 'search-auth-1');

    const response = await request(httpServer)
      .get(`/api/rooms/${roomId}/messages/search`)
      .query({ q: 'deployment' })
      .set(bearerAuthorization(outsider.accessToken))
      .expect(403);

    expect(response.body).toMatchObject({ code: ROOM_ERROR_CODES.NOT_A_MEMBER });
  });

  it('pages search results with limit and before cursor', async () => {
    const member = await registerTestUser(httpServer, { username: 'search_pager' });
    const room = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(member.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Search Pagination' })
      .expect(201);
    const roomId = createdId(room.body);

    const third = await createMessage(
      httpServer,
      member.accessToken,
      roomId,
      'deployment phase three',
      'search-page-3',
    );
    const second = await createMessage(
      httpServer,
      member.accessToken,
      roomId,
      'deployment phase two',
      'search-page-2',
    );
    const first = await createMessage(
      httpServer,
      member.accessToken,
      roomId,
      'deployment phase one',
      'search-page-1',
    );

    const pageOne = await request(httpServer)
      .get(`/api/rooms/${roomId}/messages/search`)
      .query({ q: 'deployment', limit: 2 })
      .set(bearerAuthorization(member.accessToken))
      .expect(200);

    const firstPage = pageOne.body as MessageSearchListResponse;
    expect(firstPage.items.map((item) => item.message.id)).toEqual([first.id, second.id]);
    expect(firstPage.nextCursor).toBe(second.id);

    const pageTwo = await request(httpServer)
      .get(`/api/rooms/${roomId}/messages/search`)
      .query({ q: 'deployment', limit: 2, before: firstPage.nextCursor })
      .set(bearerAuthorization(member.accessToken))
      .expect(200);

    const secondPage = pageTwo.body as MessageSearchListResponse;
    expect(secondPage.items.map((item) => item.message.id)).toEqual([third.id]);
    expect(secondPage.nextCursor).toBeUndefined();
  });

  it('handles special characters without server errors', async () => {
    const member = await registerTestUser(httpServer, { username: 'search_special' });
    const room = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(member.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Special Search' })
      .expect(201);
    const roomId = createdId(room.body);

    await createMessage(
      httpServer,
      member.accessToken,
      roomId,
      'Cost is $100 (approx) for deploy-ment',
      'search-special-1',
    );

    const response = await request(httpServer)
      .get(`/api/rooms/${roomId}/messages/search`)
      .query({ q: '$100 (approx) deploy-ment' })
      .set(bearerAuthorization(member.accessToken))
      .expect(200);

    const body = response.body as MessageSearchListResponse;
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    expect(body.items[0]?.message.content).toContain('$100');
  });
});
