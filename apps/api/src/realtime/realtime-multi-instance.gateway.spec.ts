import type { AddressInfo } from 'node:net';
import type { Server as HttpServer } from 'node:http';

import { Test, type TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';

import {
  CLIENT_SOCKET_EVENTS,
  ROOM_TYPES,
  SERVER_SOCKET_EVENTS,
  type ClientToServerEvents,
  type MessageNewEvent,
  type ServerToClientEvents,
  type TypingStartedEvent,
  type UserOfflineEvent,
  type UserOnlineEvent,
} from '@pulse-chat/shared';

import { AppModule } from '../app.module.js';
import { configureApplication } from '../bootstrap/configure-application.js';
import { APP_INSTANCE_ID, AppConfigService } from '../config/index.js';
import { RedisService } from '../infrastructure/redis/redis.service.js';
import { REDIS_CLIENT } from '../infrastructure/tokens.js';
import { createPresenceOptions, PresenceService } from '../presence/presence.service.js';
import { PRESENCE_OPTIONS } from '../presence/presence.tokens.js';
import { bearerAuthorization, registerTestUser } from '../test/auth-test.helpers.js';
import { startMongoMemoryServer, stopMongoMemoryServer } from '../test/mongo-memory.js';
import { TestRedisService } from '../test/test-redis.service.js';
import { REALTIME_BUS_CHANNELS } from './bus/realtime-bus.channels.js';

interface RunningInstance {
  readonly id: string;
  readonly moduleRef: TestingModule;
  readonly app: NestExpressApplication;
  readonly httpServer: HttpServer;
  readonly serverUrl: string;
  readonly presence: PresenceService;
}

/**
 * Two Nest applications on different ports, one shared Redis (ioredis-mock
 * Pub/Sub + keyspace). Socket.IO rooms stay process-local; cross-instance
 * delivery must go through RedisRealtimeEventBus.
 */
describe('Realtime across NestJS instances', () => {
  const redis = new TestRedisService().detachLifecycle();
  let instance1: RunningInstance;
  let instance2: RunningInstance;

  beforeAll(async () => {
    process.env['MONGODB_URI'] = await startMongoMemoryServer();
    instance1 = await bootInstance(redis, 'instance-1');
    instance2 = await bootInstance(redis, 'instance-2');
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

  it('delivers message:new and replies across instances via Redis Pub/Sub', async () => {
    const userA = await registerTestUser(instance1.httpServer, { username: 'multi_a' });
    const userB = await registerTestUser(instance2.httpServer, { username: 'multi_b' });
    const roomId = await createPublicRoom(
      instance1.httpServer,
      userA.accessToken,
      'Cross Instance Room',
    );

    await request(instance2.httpServer)
      .post(`/api/rooms/${roomId}/join`)
      .set(bearerAuthorization(userB.accessToken))
      .expect(201);

    const socketA = await connectSocket(instance1.serverUrl, userA.accessToken);
    const socketB = await connectSocket(instance2.serverUrl, userB.accessToken);

    try {
      await joinRoom(socketA, roomId);
      await joinRoom(socketB, roomId);

      const receivedOnB = onceMessageNewEvent(socketB);
      socketA.emit(CLIENT_SOCKET_EVENTS.MESSAGE_SEND, {
        roomId,
        content: 'Hello from instance 1',
        clientMessageId: 'cross-instance-a-1',
      });

      const fromA = await receivedOnB;
      expect(fromA.message).toMatchObject({
        roomId,
        authorId: userA.userId,
        content: 'Hello from instance 1',
        clientMessageId: 'cross-instance-a-1',
      });

      const receivedOnA = onceMessageNewEvent(socketA);
      socketB.emit(CLIENT_SOCKET_EVENTS.MESSAGE_SEND, {
        roomId,
        content: 'Reply from instance 2',
        clientMessageId: 'cross-instance-b-1',
      });

      const fromB = await receivedOnA;
      expect(fromB.message).toMatchObject({
        roomId,
        authorId: userB.userId,
        content: 'Reply from instance 2',
        clientMessageId: 'cross-instance-b-1',
      });

      expect(redis.publishedChannels).toContain(REALTIME_BUS_CHANNELS.MESSAGE);
    } finally {
      socketA.disconnect();
      socketB.disconnect();
      await waitForDisconnect(socketA);
      await waitForDisconnect(socketB);
    }
  });

  it('propagates typing indicators to a client on another instance', async () => {
    const userA = await registerTestUser(instance1.httpServer, { username: 'multi_typing_a' });
    const userB = await registerTestUser(instance2.httpServer, { username: 'multi_typing_b' });
    const roomId = await createPublicRoom(instance1.httpServer, userA.accessToken, 'Typing Room');

    await request(instance2.httpServer)
      .post(`/api/rooms/${roomId}/join`)
      .set(bearerAuthorization(userB.accessToken))
      .expect(201);

    const socketA = await connectSocket(instance1.serverUrl, userA.accessToken);
    const socketB = await connectSocket(instance2.serverUrl, userB.accessToken);

    try {
      await joinRoom(socketA, roomId);
      await joinRoom(socketB, roomId);

      const startedOnB = onceTypingStartedEvent(socketB);
      socketA.emit(CLIENT_SOCKET_EVENTS.TYPING_START, { roomId });

      await expect(startedOnB).resolves.toMatchObject({
        roomId,
        userId: userA.userId,
      });
      expect(redis.publishedChannels).toContain(REALTIME_BUS_CHANNELS.TYPING);
    } finally {
      socketA.disconnect();
      socketB.disconnect();
      await waitForDisconnect(socketA);
      await waitForDisconnect(socketB);
    }
  });

  it('propagates presence changes to a client on another instance', async () => {
    const userA = await registerTestUser(instance1.httpServer, { username: 'multi_presence_a' });
    const userB = await registerTestUser(instance2.httpServer, { username: 'multi_presence_b' });

    const socketB = await connectSocket(instance2.serverUrl, userB.accessToken);
    await waitUntilOnline(instance2.presence, userB.userId);

    let socketA: Socket<ServerToClientEvents, ClientToServerEvents> | undefined;
    try {
      const onlinePromise = onceUserOnlineFor(socketB, userA.userId);
      socketA = await connectSocket(instance1.serverUrl, userA.accessToken);
      await waitUntilOnline(instance1.presence, userA.userId);
      await waitUntilOnline(instance2.presence, userA.userId);

      const online = await onlinePromise;
      expect(online.userId).toBe(userA.userId);

      const offlinePromise = onceUserOfflineFor(socketB, userA.userId);
      socketA.disconnect();
      await waitForDisconnect(socketA);
      await waitUntilOffline(instance2.presence, userA.userId);

      const offline = await offlinePromise;
      expect(offline.userId).toBe(userA.userId);

      expect(redis.publishedChannels).toContain(REALTIME_BUS_CHANNELS.PRESENCE);
    } finally {
      if (socketA?.connected) {
        socketA.disconnect();
        await waitForDisconnect(socketA);
      }
      socketB.disconnect();
      await waitForDisconnect(socketB);
    }
  });

  it('recovers cross-instance delivery after a temporary Redis publish outage', async () => {
    const userA = await registerTestUser(instance1.httpServer, { username: 'multi_redis_blip_a' });
    const userB = await registerTestUser(instance2.httpServer, { username: 'multi_redis_blip_b' });
    const roomId = await createPublicRoom(
      instance1.httpServer,
      userA.accessToken,
      'Redis Blip Room',
    );

    await request(instance2.httpServer)
      .post(`/api/rooms/${roomId}/join`)
      .set(bearerAuthorization(userB.accessToken))
      .expect(201);

    const socketA = await connectSocket(instance1.serverUrl, userA.accessToken);
    const socketB = await connectSocket(instance2.serverUrl, userB.accessToken);

    try {
      await joinRoom(socketA, roomId);
      await joinRoom(socketB, roomId);

      redis.failNextPublishes(2);

      const receivedOnB = onceMessageNewEvent(socketB);
      socketA.emit(CLIENT_SOCKET_EVENTS.MESSAGE_SEND, {
        roomId,
        content: 'After Redis recovered',
        clientMessageId: 'redis-blip-1',
      });

      const fromA = await receivedOnB;
      expect(fromA.message).toMatchObject({
        roomId,
        content: 'After Redis recovered',
        clientMessageId: 'redis-blip-1',
      });
    } finally {
      socketA.disconnect();
      socketB.disconnect();
      await waitForDisconnect(socketA);
      await waitForDisconnect(socketB);
    }
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
    .overrideProvider(PRESENCE_OPTIONS)
    .useValue(createPresenceOptions({ heartbeatIntervalMs: 0, instanceId }))
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApplication(app, app.get(AppConfigService));
  await app.listen(0);

  const httpServer = app.getHttpServer();
  const address = httpServer.address() as AddressInfo;

  return {
    id: instanceId,
    moduleRef,
    app,
    httpServer,
    serverUrl: `http://127.0.0.1:${String(address.port)}`,
    presence: moduleRef.get(PresenceService),
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
  const joined = onceRoomJoinedEvent(socket);
  socket.emit(CLIENT_SOCKET_EVENTS.ROOM_JOIN, { roomId });
  await joined;
}

function onceRoomJoinedEvent(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
): Promise<void> {
  return new Promise((resolve) => {
    socket.once(SERVER_SOCKET_EVENTS.ROOM_JOINED, () => resolve());
  });
}

function onceMessageNewEvent(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
): Promise<MessageNewEvent> {
  return new Promise((resolve) => {
    socket.once(SERVER_SOCKET_EVENTS.MESSAGE_NEW, (payload: MessageNewEvent) => resolve(payload));
  });
}

function onceTypingStartedEvent(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
): Promise<TypingStartedEvent> {
  return new Promise((resolve) => {
    socket.once(SERVER_SOCKET_EVENTS.TYPING_STARTED, (payload: TypingStartedEvent) =>
      resolve(payload),
    );
  });
}

function onceUserOnlineFor(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  userId: string,
): Promise<UserOnlineEvent> {
  return new Promise((resolve) => {
    const handler = (payload: UserOnlineEvent): void => {
      if (payload.userId === userId) {
        socket.off(SERVER_SOCKET_EVENTS.USER_ONLINE, handler);
        resolve(payload);
      }
    };
    socket.on(SERVER_SOCKET_EVENTS.USER_ONLINE, handler);
  });
}

function onceUserOfflineFor(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  userId: string,
): Promise<UserOfflineEvent> {
  return new Promise((resolve) => {
    const handler = (payload: UserOfflineEvent): void => {
      if (payload.userId === userId) {
        socket.off(SERVER_SOCKET_EVENTS.USER_OFFLINE, handler);
        resolve(payload);
      }
    };
    socket.on(SERVER_SOCKET_EVENTS.USER_OFFLINE, handler);
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

async function waitUntilOnline(presence: PresenceService, userId: string): Promise<void> {
  await waitForCondition(async () => presence.isOnline(userId));
}

async function waitUntilOffline(presence: PresenceService, userId: string): Promise<void> {
  await waitForCondition(async () => !(await presence.isOnline(userId)));
}

async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 5000,
): Promise<void> {
  const start = Date.now();

  while (!(await condition())) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Condition was not met in time.');
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
