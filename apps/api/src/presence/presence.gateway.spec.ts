import type { AddressInfo } from 'node:net';
import type { Server as HttpServer } from 'node:http';

import { Test, type TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';

import {
  SERVER_SOCKET_EVENTS,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type UserOfflineEvent,
  type UserOnlineEvent,
} from '@pulse-chat/shared';

import { AppModule } from '../app.module.js';
import { configureApplication } from '../bootstrap/configure-application.js';
import { AppConfigService } from '../config/index.js';
import type { RedisClient } from '../infrastructure/redis/redis-client.interface.js';
import { RedisService } from '../infrastructure/redis/redis.service.js';
import { REDIS_CLIENT } from '../infrastructure/tokens.js';
import { registerTestUser } from '../test/auth-test.helpers.js';
import { startMongoMemoryServer, stopMongoMemoryServer } from '../test/mongo-memory.js';
import { TestRedisService } from '../test/test-redis.service.js';
import {
  presenceSessionKey,
  presenceUserKey,
  presenceUserSessionsKey,
} from './infrastructure/redis-presence.store.js';
import { createPresenceOptions, PresenceService } from './presence.service.js';
import { PRESENCE_OPTIONS } from './presence.tokens.js';

describe('Presence over WebSocket', () => {
  let moduleRef: TestingModule;
  let app: NestExpressApplication;
  let presence: PresenceService;
  let redis: RedisClient;
  let serverUrl: string;
  let httpServer: HttpServer;

  beforeAll(async () => {
    process.env['MONGODB_URI'] = await startMongoMemoryServer();

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RedisService)
      .useClass(TestRedisService)
      .overrideProvider(PRESENCE_OPTIONS)
      .useValue(createPresenceOptions({ heartbeatIntervalMs: 0, instanceId: 'presence-test' }))
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApplication(app, app.get(AppConfigService));
    await app.listen(0);

    presence = moduleRef.get(PresenceService);
    redis = moduleRef.get<RedisClient>(REDIS_CLIENT);
    httpServer = app.getHttpServer();
    const address = httpServer.address() as AddressInfo;
    serverUrl = `http://127.0.0.1:${String(address.port)}`;
  });

  afterAll(async () => {
    await app?.close();
    await moduleRef?.close();
    await stopMongoMemoryServer();
  });

  it('emits user:online on the first connection', async () => {
    const user = await registerTestUser(httpServer, { username: 'presence_first' });
    const observer = await registerTestUser(httpServer, { username: 'presence_first_obs' });
    const observerSocket = await connectSocket(serverUrl, observer.accessToken);
    await waitUntilOnline(presence, observer.userId);

    try {
      const onlinePromise = onceUserOnlineFor(observerSocket, user.userId);
      const socket = await connectSocket(serverUrl, user.accessToken);
      const event = await onlinePromise;

      expect(event.userId).toBe(user.userId);
      expect(typeof event.lastSeenAt).toBe('string');
      expect(await presence.isOnline(user.userId)).toBe(true);
      expect(presence.countLocalConnections(user.userId)).toBe(1);

      socket.disconnect();
      await waitForDisconnect(socket);
    } finally {
      observerSocket.disconnect();
      await waitForDisconnect(observerSocket);
    }
  });

  it('keeps the user online without a second user:online when another device connects', async () => {
    const user = await registerTestUser(httpServer, { username: 'presence_second_conn' });
    const observer = await registerTestUser(httpServer, { username: 'presence_second_conn_obs' });
    const observerSocket = await connectSocket(serverUrl, observer.accessToken);
    await waitUntilOnline(presence, observer.userId);

    const firstOnline = onceUserOnlineFor(observerSocket, user.userId);
    const first = await connectSocket(serverUrl, user.accessToken);
    await firstOnline;

    try {
      let extraOnline = 0;
      observerSocket.on(SERVER_SOCKET_EVENTS.USER_ONLINE, (event: UserOnlineEvent) => {
        if (event.userId === user.userId) {
          extraOnline += 1;
        }
      });

      const second = await connectSocket(serverUrl, user.accessToken);
      await waitForCondition(() => presence.countLocalConnections(user.userId) === 2);
      await delay(150);

      expect(extraOnline).toBe(0);
      expect(await presence.isOnline(user.userId)).toBe(true);

      first.disconnect();
      second.disconnect();
      await waitForDisconnect(first);
      await waitForDisconnect(second);
    } finally {
      observerSocket.disconnect();
      await waitForDisconnect(observerSocket);
    }
  });

  it('does not emit user:offline when a second device stays connected', async () => {
    const user = await registerTestUser(httpServer, { username: 'presence_second' });
    const observer = await registerTestUser(httpServer, { username: 'presence_second_obs' });
    const observerSocket = await connectSocket(serverUrl, observer.accessToken);
    await waitUntilOnline(presence, observer.userId);

    const first = await connectSocket(serverUrl, user.accessToken);
    await waitUntilOnline(presence, user.userId);

    try {
      const second = await connectSocket(serverUrl, user.accessToken);
      await waitForCondition(() => presence.countLocalConnections(user.userId) === 2);

      expect(await presence.isOnline(user.userId)).toBe(true);

      let wentOffline = false;
      observerSocket.on(SERVER_SOCKET_EVENTS.USER_OFFLINE, (event: UserOfflineEvent) => {
        if (event.userId === user.userId) {
          wentOffline = true;
        }
      });

      first.disconnect();
      await waitForDisconnect(first);
      await waitForCondition(() => presence.countLocalConnections(user.userId) === 1);
      await delay(150);

      expect(wentOffline).toBe(false);
      expect(await presence.isOnline(user.userId)).toBe(true);

      second.disconnect();
      await waitForDisconnect(second);
    } finally {
      observerSocket.disconnect();
      await waitForDisconnect(observerSocket);
    }
  });

  it('emits user:offline when the final connection disconnects', async () => {
    const user = await registerTestUser(httpServer, { username: 'presence_final' });
    const observer = await registerTestUser(httpServer, { username: 'presence_final_obs' });
    const observerSocket = await connectSocket(serverUrl, observer.accessToken);
    await waitUntilOnline(presence, observer.userId);

    const socket = await connectSocket(serverUrl, user.accessToken);
    await waitUntilOnline(presence, user.userId);

    try {
      const offlinePromise = onceUserOfflineFor(observerSocket, user.userId);
      socket.disconnect();
      const event = await offlinePromise;

      expect(event.userId).toBe(user.userId);
      expect(await presence.isOnline(user.userId)).toBe(false);
      expect(presence.countLocalConnections(user.userId)).toBe(0);
    } finally {
      observerSocket.disconnect();
      await waitForDisconnect(observerSocket);
    }
  });

  it('supports multiple devices and reconnects as a new online session', async () => {
    const user = await registerTestUser(httpServer, { username: 'presence_devices' });
    const desktop = await connectSocket(serverUrl, user.accessToken);
    const mobile = await connectSocket(serverUrl, user.accessToken);
    await waitForCondition(() => presence.countLocalConnections(user.userId) === 2);

    try {
      const snapshot = await presence.getPresence(user.userId);
      expect(snapshot?.socketIds).toHaveLength(2);

      desktop.disconnect();
      mobile.disconnect();
      await waitForDisconnect(desktop);
      await waitForDisconnect(mobile);
      await waitForCondition(async () => !(await presence.isOnline(user.userId)));

      const reconnected = await connectSocket(serverUrl, user.accessToken);
      await waitUntilOnline(presence, user.userId);
      expect(presence.countLocalConnections(user.userId)).toBe(1);
      reconnected.disconnect();
      await waitForDisconnect(reconnected);
    } finally {
      if (desktop.connected) {
        desktop.disconnect();
        await waitForDisconnect(desktop);
      }
      if (mobile.connected) {
        mobile.disconnect();
        await waitForDisconnect(mobile);
      }
    }
  });

  it('emits user:online again after a full reconnect', async () => {
    const user = await registerTestUser(httpServer, { username: 'presence_reconnect' });
    const observer = await registerTestUser(httpServer, { username: 'presence_reconnect_obs' });
    const observerSocket = await connectSocket(serverUrl, observer.accessToken);
    await waitUntilOnline(presence, observer.userId);

    const first = await connectSocket(serverUrl, user.accessToken);
    await waitUntilOnline(presence, user.userId);
    first.disconnect();
    await waitForDisconnect(first);
    await waitForCondition(async () => !(await presence.isOnline(user.userId)));

    try {
      const onlinePromise = onceUserOnlineFor(observerSocket, user.userId);
      const second = await connectSocket(serverUrl, user.accessToken);
      const event = await onlinePromise;

      expect(event.userId).toBe(user.userId);
      expect(await presence.isOnline(user.userId)).toBe(true);

      second.disconnect();
      await waitForDisconnect(second);
    } finally {
      observerSocket.disconnect();
      await waitForDisconnect(observerSocket);
    }
  });

  it('emits exactly one user:online even when two devices connect simultaneously', async () => {
    const user = await registerTestUser(httpServer, { username: 'presence_concurrent' });
    const observer = await registerTestUser(httpServer, { username: 'presence_concurrent_obs' });
    const observerSocket = await connectSocket(serverUrl, observer.accessToken);
    await waitUntilOnline(presence, observer.userId);

    try {
      let onlineCount = 0;
      observerSocket.on(SERVER_SOCKET_EVENTS.USER_ONLINE, (event: UserOnlineEvent) => {
        if (event.userId === user.userId) {
          onlineCount += 1;
        }
      });

      // Both sockets connect in parallel — neither has yielded to the event loop
      // before the other starts its connection handshake.
      const [device1, device2] = await Promise.all([
        connectSocket(serverUrl, user.accessToken),
        connectSocket(serverUrl, user.accessToken),
      ]);

      await waitForCondition(() => presence.countLocalConnections(user.userId) === 2);
      await delay(200);

      expect(onlineCount).toBe(1);
      expect(await presence.isOnline(user.userId)).toBe(true);

      device1.disconnect();
      device2.disconnect();
      await waitForDisconnect(device1);
      await waitForDisconnect(device2);
    } finally {
      observerSocket.disconnect();
      await waitForDisconnect(observerSocket);
    }
  });

  it('marks a user offline after presence keys expire without a disconnect', async () => {
    const user = await registerTestUser(httpServer, { username: 'presence_ttl' });
    const socket = await connectSocket(serverUrl, user.accessToken);
    await waitUntilOnline(presence, user.userId);

    const socketId = socket.id ?? '';
    await redis.expire(presenceUserKey(user.userId), 0);
    await redis.expire(presenceSessionKey(socketId), 0);
    await redis.expire(presenceUserSessionsKey(user.userId), 0);

    await presence.sweepExpired();

    expect(await presence.isOnline(user.userId)).toBe(false);
    expect(presence.countLocalConnections(user.userId)).toBe(0);

    socket.disconnect();
    await waitForDisconnect(socket);
  });
});

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

async function waitUntilOnline(presence: PresenceService, userId: string): Promise<void> {
  await waitForCondition(async () => presence.isOnline(userId));
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

async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 2000,
): Promise<void> {
  const start = Date.now();

  while (!(await condition())) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Condition was not met in time.');
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
