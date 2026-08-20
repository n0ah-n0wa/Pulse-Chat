import type { AddressInfo } from 'node:net';
import type { Server as HttpServer } from 'node:http';

import { Test, type TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';

import {
  CLIENT_SOCKET_EVENTS,
  NOTIFICATION_TYPES,
  ROOM_TYPES,
  SERVER_SOCKET_EVENTS,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@pulse-chat/shared';

import { AppModule } from '../app.module.js';
import { configureApplication } from '../bootstrap/configure-application.js';
import { AppConfigService } from '../config/index.js';
import { RedisService } from '../infrastructure/redis/redis.service.js';
import { bearerAuthorization, registerTestUser } from '../test/auth-test.helpers.js';
import { startMongoMemoryServer, stopMongoMemoryServer } from '../test/mongo-memory.js';
import { TestRedisService } from '../test/test-redis.service.js';

describe('Message @username mentions', () => {
  let moduleRef: TestingModule;
  let app: NestExpressApplication;
  let httpServer: HttpServer;
  let serverUrl: string;

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
    await app.listen(0);

    httpServer = app.getHttpServer();
    const address = httpServer.address() as AddressInfo;
    serverUrl = `http://127.0.0.1:${String(address.port)}`;
  });

  afterAll(async () => {
    await app?.close();
    await moduleRef?.close();
    await stopMongoMemoryServer();
  });

  it('creates a mention notification for a single @username via REST', async () => {
    const author = await registerTestUser(httpServer, { username: 'mention_rest_author' });
    const target = await registerTestUser(httpServer, { username: 'mention_rest_target' });
    const roomId = await createPublicRoom(httpServer, author.accessToken, 'REST Mention Room');

    await request(httpServer)
      .post(`/api/rooms/${roomId}/join`)
      .set(bearerAuthorization(target.accessToken))
      .expect(201);

    await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(author.accessToken))
      .send({
        content: 'Hello @mention_rest_target',
        clientMessageId: 'rest-mention-1',
      })
      .expect(201);

    await delay(300);

    const response = await request(httpServer)
      .get('/api/notifications')
      .set(bearerAuthorization(target.accessToken))
      .expect(200);

    const items = (response.body as { items: unknown[] }).items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: NOTIFICATION_TYPES.MENTION,
      userId: target.userId,
      actorId: author.userId,
      isRead: false,
    });
  });

  it('creates mention notifications for multiple @usernames via WebSocket', async () => {
    const author = await registerTestUser(httpServer, { username: 'mention_multi_author' });
    const alice = await registerTestUser(httpServer, { username: 'mention_alice' });
    const bob = await registerTestUser(httpServer, { username: 'mention_bob' });
    const roomId = await createPublicRoom(httpServer, author.accessToken, 'Multi Mention Room');

    for (const member of [alice, bob]) {
      await request(httpServer)
        .post(`/api/rooms/${roomId}/join`)
        .set(bearerAuthorization(member.accessToken))
        .expect(201);
    }

    const socket = await connectSocket(serverUrl, author.accessToken);
    try {
      await joinRoom(socket, roomId);

      socket.emit(CLIENT_SOCKET_EVENTS.MESSAGE_SEND, {
        roomId,
        content: '@mention_alice and @mention_bob please read this',
        clientMessageId: 'ws-multi-mention',
      });
      await onceMessageNewEvent(socket);
      await delay(300);

      for (const recipient of [alice, bob]) {
        const response = await request(httpServer)
          .get('/api/notifications')
          .set(bearerAuthorization(recipient.accessToken))
          .expect(200);

        expect((response.body as { items: unknown[] }).items).toHaveLength(1);
      }
    } finally {
      socket.disconnect();
      await waitForDisconnect(socket);
    }
  });

  it('does not create notifications for nonexistent usernames', async () => {
    const author = await registerTestUser(httpServer, { username: 'mention_nouser_author' });
    const roomId = await createPublicRoom(httpServer, author.accessToken, 'No User Room');

    await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(author.accessToken))
      .send({
        content: 'Hello @this_user_does_not_exist_123',
        clientMessageId: 'rest-nouser-1',
      })
      .expect(201);

    await delay(200);

    const response = await request(httpServer)
      .get('/api/notifications')
      .set(bearerAuthorization(author.accessToken))
      .expect(200);

    expect((response.body as { items: unknown[] }).items).toHaveLength(0);
  });

  it('creates only one notification when the same @username is repeated in one message', async () => {
    const author = await registerTestUser(httpServer, { username: 'mention_repeat_author' });
    const target = await registerTestUser(httpServer, { username: 'mention_repeat_target' });
    const roomId = await createPublicRoom(httpServer, author.accessToken, 'Repeat Mention Room');

    await request(httpServer)
      .post(`/api/rooms/${roomId}/join`)
      .set(bearerAuthorization(target.accessToken))
      .expect(201);

    await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(author.accessToken))
      .send({
        content: '@mention_repeat_target @mention_repeat_target @mention_repeat_target',
        clientMessageId: 'rest-repeat-1',
      })
      .expect(201);

    await delay(300);

    const response = await request(httpServer)
      .get('/api/notifications')
      .set(bearerAuthorization(target.accessToken))
      .expect(200);

    expect((response.body as { items: unknown[] }).items).toHaveLength(1);
  });

  it('does not create a mention notification when the author mentions themselves', async () => {
    const author = await registerTestUser(httpServer, { username: 'mention_self_user' });
    const roomId = await createPublicRoom(httpServer, author.accessToken, 'Self Mention Room');

    await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(author.accessToken))
      .send({
        content: 'Note to self @mention_self_user',
        clientMessageId: 'rest-self-1',
      })
      .expect(201);

    await delay(200);

    const response = await request(httpServer)
      .get('/api/notifications')
      .set(bearerAuthorization(author.accessToken))
      .expect(200);

    expect((response.body as { items: unknown[] }).items).toHaveLength(0);
  });

  it('does not treat raw ObjectId syntax as a mention', async () => {
    const author = await registerTestUser(httpServer, { username: 'mention_oid_author' });
    const target = await registerTestUser(httpServer, { username: 'mention_oid_target' });
    const roomId = await createPublicRoom(httpServer, author.accessToken, 'ObjectId Room');

    await request(httpServer)
      .post(`/api/rooms/${roomId}/join`)
      .set(bearerAuthorization(target.accessToken))
      .expect(201);

    await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(author.accessToken))
      .send({
        content: `Ping @${target.userId}`,
        clientMessageId: 'rest-oid-1',
      })
      .expect(201);

    await delay(200);

    const response = await request(httpServer)
      .get('/api/notifications')
      .set(bearerAuthorization(target.accessToken))
      .expect(200);

    expect((response.body as { items: unknown[] }).items).toHaveLength(0);
  });

  it('does not re-dispatch mention notifications when the same message is retried', async () => {
    const author = await registerTestUser(httpServer, { username: 'mention_retry_author' });
    const target = await registerTestUser(httpServer, { username: 'mention_retry_target' });
    const roomId = await createPublicRoom(httpServer, author.accessToken, 'Retry Mention Room');

    await request(httpServer)
      .post(`/api/rooms/${roomId}/join`)
      .set(bearerAuthorization(target.accessToken))
      .expect(201);

    const payload = {
      content: 'Hey @mention_retry_target',
      clientMessageId: 'retry-mention-1',
    };

    await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(author.accessToken))
      .send(payload)
      .expect(201);

    await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(author.accessToken))
      .send(payload)
      .expect(201);

    await delay(300);

    const response = await request(httpServer)
      .get('/api/notifications')
      .set(bearerAuthorization(target.accessToken))
      .expect(200);

    expect((response.body as { items: unknown[] }).items).toHaveLength(1);
  });

  it('does not treat email addresses as mentions', async () => {
    const author = await registerTestUser(httpServer, { username: 'mention_email_author' });
    const roomId = await createPublicRoom(
      httpServer,
      author.accessToken,
      'Email False Positive Room',
    );

    await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(author.accessToken))
      .send({
        content: 'Contact me at user@example.com',
        clientMessageId: 'rest-email-1',
      })
      .expect(201);

    await delay(200);

    const response = await request(httpServer)
      .get('/api/notifications')
      .set(bearerAuthorization(author.accessToken))
      .expect(200);

    expect((response.body as { items: unknown[] }).items).toHaveLength(0);
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

function createSocket(
  serverUrl: string,
  token: string,
): Socket<ServerToClientEvents, ClientToServerEvents> {
  return io(serverUrl, {
    path: '/socket.io',
    transports: ['websocket'],
    autoConnect: false,
    auth: { token },
  });
}

function connectSocket(
  serverUrl: string,
  token: string,
): Promise<Socket<ServerToClientEvents, ClientToServerEvents>> {
  return new Promise((resolve, reject) => {
    const socket = createSocket(serverUrl, token);
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (error) => {
      socket.close();
      reject(error);
    });
    socket.connect();
  });
}

async function joinRoom(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  roomId: string,
): Promise<void> {
  const joined = new Promise<void>((resolve) => {
    socket.once(SERVER_SOCKET_EVENTS.ROOM_JOINED, () => resolve());
  });
  socket.emit(CLIENT_SOCKET_EVENTS.ROOM_JOIN, { roomId });
  await joined;
}

function onceMessageNewEvent(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
): Promise<void> {
  return new Promise((resolve) => {
    socket.once(SERVER_SOCKET_EVENTS.MESSAGE_NEW, () => resolve());
  });
}

function waitForDisconnect(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
): Promise<void> {
  if (!socket.connected) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    socket.once('disconnect', () => resolve());
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
