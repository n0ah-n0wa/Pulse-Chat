import type { AddressInfo } from 'node:net';
import type { Server as HttpServer } from 'node:http';

import { Test, type TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';

import {
  API_ERROR_CODES,
  CLIENT_SOCKET_EVENTS,
  ROOM_TYPES,
  SERVER_SOCKET_EVENTS,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@pulse-chat/shared';

import { AppModule } from '../app.module.js';
import { configureApplication } from '../bootstrap/configure-application.js';
import { AppConfigService } from '../config/index.js';
import { RedisService } from '../infrastructure/redis/redis.service.js';
import { REDIS_CLIENT } from '../infrastructure/tokens.js';
import { bearerAuthorization, registerTestUser } from '../test/auth-test.helpers.js';
import { startMongoMemoryServer, stopMongoMemoryServer } from '../test/mongo-memory.js';
import { TestRedisService } from '../test/test-redis.service.js';
import { RATE_LIMIT_ACTIONS, rateLimitKey } from './rate-limit.keys.js';
import { RATE_LIMIT_ERROR_MESSAGE } from './rate-limit.service.js';

const PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

describe('Distributed rate limiting', () => {
  const redis = new TestRedisService().detachLifecycle();
  let moduleRef: TestingModule;
  let app: NestExpressApplication;
  let httpServer: HttpServer;
  let serverUrl: string;
  let config: AppConfigService;

  beforeAll(async () => {
    process.env['MONGODB_URI'] = await startMongoMemoryServer();

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RedisService)
      .useValue(redis)
      .overrideProvider(REDIS_CLIENT)
      .useValue(redis)
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApplication(app, app.get(AppConfigService));
    await app.listen(0);

    httpServer = app.getHttpServer();
    const address = httpServer.address() as AddressInfo;
    serverUrl = `http://127.0.0.1:${String(address.port)}`;
    config = app.get(AppConfigService);
  });

  afterAll(async () => {
    await app?.close();
    await moduleRef?.close();
    await redis.dispose();
    await stopMongoMemoryServer();
  });

  it('allows message creation below the per-user limit', async () => {
    const owner = await registerTestUser(httpServer, { username: 'rl_msg_ok' });
    const roomId = await createPublicRoom(httpServer, owner.accessToken, 'Below limit');

    await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ content: 'Hello', clientMessageId: 'rl-below-1' })
      .expect(201);
  });

  it('rejects message creation, edits, reactions, search, uploads and websocket sends with the same 429 body', async () => {
    const owner = await registerTestUser(httpServer, { username: 'rl_msg_block' });
    const roomId = await createPublicRoom(httpServer, owner.accessToken, 'At limit');

    const created = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ content: 'For mutations', clientMessageId: 'rl-mutate-origin' })
      .expect(201);
    const messageId = (created.body as { id: string }).id;

    await redis.set(
      rateLimitKey(RATE_LIMIT_ACTIONS.MESSAGES, owner.userId),
      String(config.rateLimit.messages),
      config.rateLimit.messagesWindowSeconds,
    );
    await redis.set(
      rateLimitKey(RATE_LIMIT_ACTIONS.SEARCH, owner.userId),
      String(config.rateLimit.search),
      config.rateLimit.searchWindowSeconds,
    );
    await redis.set(
      rateLimitKey(RATE_LIMIT_ACTIONS.UPLOADS, owner.userId),
      String(config.rateLimit.uploads),
      config.rateLimit.uploadsWindowSeconds,
    );

    const tooMany = {
      statusCode: 429,
      code: API_ERROR_CODES.TOO_MANY_REQUESTS,
      message: RATE_LIMIT_ERROR_MESSAGE,
    };

    const createResponse = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ content: 'Blocked', clientMessageId: 'rl-block-1' })
      .expect(429);
    expect(createResponse.body).toMatchObject(tooMany);

    const editResponse = await request(httpServer)
      .patch(`/api/messages/${messageId}`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ content: 'Edited' })
      .expect(429);
    expect(editResponse.body).toMatchObject(tooMany);

    const reactResponse = await request(httpServer)
      .post(`/api/messages/${messageId}/reactions`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ emoji: '👍' })
      .expect(429);
    expect(reactResponse.body).toMatchObject(tooMany);

    const searchResponse = await request(httpServer)
      .get(`/api/rooms/${roomId}/messages/search`)
      .query({ q: 'hello' })
      .set(bearerAuthorization(owner.accessToken))
      .expect(429);
    expect(searchResponse.body).toMatchObject(tooMany);

    const uploadResponse = await request(httpServer)
      .post(`/api/rooms/${roomId}/attachments`)
      .set(bearerAuthorization(owner.accessToken))
      .attach('file', PNG_BUFFER, 'screenshot.png')
      .expect(429);
    expect(uploadResponse.body).toMatchObject(tooMany);

    const socket = await connectSocket(serverUrl, owner.accessToken);
    try {
      const errorPromise = onceSocketErrorEvent(socket);
      socket.emit(CLIENT_SOCKET_EVENTS.MESSAGE_SEND, {
        roomId,
        content: 'Blocked over websocket',
        clientMessageId: 'rl-ws-block-1',
      });
      await expect(errorPromise).resolves.toMatchObject({
        code: API_ERROR_CODES.TOO_MANY_REQUESTS,
        message: RATE_LIMIT_ERROR_MESSAGE,
      });
    } finally {
      socket.disconnect();
    }
  });

  it('allows traffic again after the Redis window is reset', async () => {
    const owner = await registerTestUser(httpServer, { username: 'rl_reset' });
    const roomId = await createPublicRoom(httpServer, owner.accessToken, 'Reset window');
    const key = rateLimitKey(RATE_LIMIT_ACTIONS.MESSAGES, owner.userId);

    await redis.set(key, String(config.rateLimit.messages), config.rateLimit.messagesWindowSeconds);

    await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ content: 'Blocked', clientMessageId: 'rl-reset-1' })
      .expect(429);

    await redis.expire(key, 0);

    await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ content: 'After reset', clientMessageId: 'rl-reset-2' })
      .expect(201);
  });
});

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

function connectSocket(
  serverUrl: string,
  token: string,
): Promise<Socket<ServerToClientEvents, ClientToServerEvents>> {
  return new Promise((resolve, reject) => {
    const socket = io(serverUrl, {
      path: '/socket.io',
      transports: ['websocket'],
      autoConnect: false,
      auth: { token },
    });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (error) => {
      socket.close();
      reject(error);
    });
    socket.connect();
  });
}

function onceSocketErrorEvent(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
): Promise<{ code: string; message: string }> {
  return new Promise((resolve) => {
    socket.once(SERVER_SOCKET_EVENTS.ERROR, (payload: { code: string; message: string }) =>
      resolve(payload),
    );
  });
}
