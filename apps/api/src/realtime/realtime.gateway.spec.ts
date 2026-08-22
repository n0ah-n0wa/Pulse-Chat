import type { AddressInfo } from 'node:net';
import type { Server as HttpServer } from 'node:http';

import { Test, type TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';

import {
  API_ERROR_CODES,
  AUTH_ERROR_CODES,
  CLIENT_SOCKET_EVENTS,
  MEMBERSHIP_ROLES,
  ROOM_ERROR_CODES,
  ROOM_TYPES,
  SERVER_SOCKET_EVENTS,
  type ClientToServerEvents,
  type RoomJoinedEvent,
  type RoomLeftEvent,
  type ServerToClientEvents,
} from '@pulse-chat/shared';

import { AppModule } from '../app.module.js';
import { configureApplication } from '../bootstrap/configure-application.js';
import { AppConfigService } from '../config/index.js';
import { RedisService } from '../infrastructure/redis/redis.service.js';
import {
  bearerAuthorization,
  registerTestUser,
  signExpiredAccessToken,
} from '../test/auth-test.helpers.js';
import { startMongoMemoryServer, stopMongoMemoryServer } from '../test/mongo-memory.js';
import { TestRedisService } from '../test/test-redis.service.js';
import { RealtimeConnectionStateService } from './realtime-connection-state.service.js';

describe('RealtimeGateway', () => {
  let moduleRef: TestingModule;
  let app: NestExpressApplication;
  let connectionState: RealtimeConnectionStateService;
  let serverUrl: string;
  let httpServer: HttpServer;

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

    connectionState = moduleRef.get(RealtimeConnectionStateService);
    httpServer = app.getHttpServer();
    const address = httpServer.address() as AddressInfo;
    serverUrl = `http://127.0.0.1:${String(address.port)}`;
  });

  afterAll(async () => {
    await app?.close();
    await moduleRef?.close();
    await stopMongoMemoryServer();
  });

  it('accepts an authenticated websocket connection', async () => {
    const user = await registerTestUser(httpServer, { username: 'ws_auth_ok' });
    const socket = await connectSocket(serverUrl, user.accessToken);
    const socketId = socket.id;

    try {
      expect(socket.connected).toBe(true);
      expect(socketId).toBeDefined();
      expect(connectionState.countConnectionsForUser(user.userId)).toBe(1);
      expect(connectionState.hasConnection(socketId ?? '')).toBe(true);
    } finally {
      socket.disconnect();
      await waitForDisconnect(socket);
    }
  });

  it('rejects an unauthenticated websocket connection', async () => {
    const error = await connectSocketError(serverUrl);

    expect(error.message).toBe('Authentication required.');
    expect((error as Error & { data?: { code?: string } }).data?.code).toBe(
      API_ERROR_CODES.UNAUTHORIZED,
    );
  });

  it('rejects an invalid token during the handshake', async () => {
    const error = await connectSocketError(serverUrl, 'not-a-token');

    expect(error.message).toBe('Authentication required.');
    expect((error as Error & { data?: { code?: string } }).data?.code).toBe(
      API_ERROR_CODES.UNAUTHORIZED,
    );
  });

  it('removes connection state when the socket disconnects', async () => {
    const user = await registerTestUser(httpServer, { username: 'ws_disconnect' });
    const socket = await connectSocket(serverUrl, user.accessToken);
    const socketId = socket.id;

    socket.disconnect();
    await waitForDisconnect(socket);
    await waitForCondition(() => connectionState.countConnectionsForUser(user.userId) === 0);

    expect(connectionState.countConnectionsForUser(user.userId)).toBe(0);
    expect(connectionState.hasConnection(socketId ?? '')).toBe(false);
  });

  it('emits a validation error for malformed realtime payloads', async () => {
    const user = await registerTestUser(httpServer, { username: 'ws_malformed' });
    const socket = await connectSocket(serverUrl, user.accessToken);

    try {
      const errorPromise = onceSocketErrorEvent(socket);
      socket.emit(CLIENT_SOCKET_EVENTS.ROOM_JOIN, { roomId: 'bad-id' });
      const error = await errorPromise;

      expect(error).toMatchObject({
        code: API_ERROR_CODES.VALIDATION_FAILED,
      });
    } finally {
      socket.disconnect();
      await waitForDisconnect(socket);
    }
  });

  it('emits a validation error for malformed room leave payloads', async () => {
    const user = await registerTestUser(httpServer, { username: 'ws_malformed_leave' });
    const socket = await connectSocket(serverUrl, user.accessToken);

    try {
      const errorPromise = onceSocketErrorEvent(socket);
      socket.emit(CLIENT_SOCKET_EVENTS.ROOM_LEAVE, { roomId: 'bad-id' });
      const error = await errorPromise;

      expect(error).toMatchObject({
        code: API_ERROR_CODES.VALIDATION_FAILED,
      });
    } finally {
      socket.disconnect();
      await waitForDisconnect(socket);
    }
  });

  it('joins a room and returns room state for members', async () => {
    const owner = await registerTestUser(httpServer, { username: 'ws_join_owner' });
    const created = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Realtime Town Hall' })
      .expect(201);

    const roomId = (created.body as { id: string }).id;
    const socket = await connectSocket(serverUrl, owner.accessToken);

    try {
      const joinedPromise = onceRoomJoinedEvent(socket);
      socket.emit(CLIENT_SOCKET_EVENTS.ROOM_JOIN, { roomId });
      const joined = await joinedPromise;

      expect(joined).toMatchObject({
        roomId,
        room: {
          id: roomId,
          name: 'Realtime Town Hall',
          type: ROOM_TYPES.PUBLIC,
          ownerId: owner.userId,
          currentUserRole: MEMBERSHIP_ROLES.OWNER,
        },
      });
      expect(connectionState.getRoomSubscriptions(socket.id ?? '')).toEqual([roomId]);
    } finally {
      socket.disconnect();
      await waitForDisconnect(socket);
    }
  });

  it('rejects room joins from non-members of public rooms', async () => {
    const owner = await registerTestUser(httpServer, { username: 'ws_join_pub_owner' });
    const outsider = await registerTestUser(httpServer, { username: 'ws_join_pub_outsider' });
    const created = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Members Only Realtime' })
      .expect(201);

    const roomId = (created.body as { id: string }).id;
    const socket = await connectSocket(serverUrl, outsider.accessToken);

    try {
      const errorPromise = onceSocketErrorEvent(socket);
      socket.emit(CLIENT_SOCKET_EVENTS.ROOM_JOIN, { roomId });
      const error = await errorPromise;

      expect(error).toMatchObject({
        code: ROOM_ERROR_CODES.NOT_A_MEMBER,
      });
      expect(connectionState.getRoomSubscriptions(socket.id ?? '')).toEqual([]);
    } finally {
      socket.disconnect();
      await waitForDisconnect(socket);
    }
  });

  it('rejects room joins for private rooms without access', async () => {
    const owner = await registerTestUser(httpServer, { username: 'ws_join_priv_owner' });
    const outsider = await registerTestUser(httpServer, { username: 'ws_join_priv_outsider' });
    const created = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PRIVATE, name: 'Secret Realtime Room' })
      .expect(201);

    const roomId = (created.body as { id: string }).id;
    const socket = await connectSocket(serverUrl, outsider.accessToken);

    try {
      const errorPromise = onceSocketErrorEvent(socket);
      socket.emit(CLIENT_SOCKET_EVENTS.ROOM_JOIN, { roomId });
      const error = await errorPromise;

      expect(error).toMatchObject({
        code: ROOM_ERROR_CODES.ROOM_ACCESS_DENIED,
      });
      expect(connectionState.getRoomSubscriptions(socket.id ?? '')).toEqual([]);
    } finally {
      socket.disconnect();
      await waitForDisconnect(socket);
    }
  });

  it('leaves a subscribed room', async () => {
    const owner = await registerTestUser(httpServer, { username: 'ws_leave_owner' });
    const created = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Leave Test Room' })
      .expect(201);

    const roomId = (created.body as { id: string }).id;
    const socket = await connectSocket(serverUrl, owner.accessToken);

    try {
      const joinedPromise = onceRoomJoinedEvent(socket);
      socket.emit(CLIENT_SOCKET_EVENTS.ROOM_JOIN, { roomId });
      await joinedPromise;

      const leftPromise = onceRoomLeftEvent(socket);
      socket.emit(CLIENT_SOCKET_EVENTS.ROOM_LEAVE, { roomId });
      const left = await leftPromise;

      expect(left).toEqual({ roomId });
      expect(connectionState.getRoomSubscriptions(socket.id ?? '')).toEqual([]);
    } finally {
      socket.disconnect();
      await waitForDisconnect(socket);
    }
  });

  it('clears room subscriptions when the socket disconnects', async () => {
    const owner = await registerTestUser(httpServer, { username: 'ws_disconnect_subs' });
    const created = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Disconnect Cleanup Room' })
      .expect(201);

    const roomId = (created.body as { id: string }).id;
    const socket = await connectSocket(serverUrl, owner.accessToken);
    const socketId = socket.id ?? '';

    const joinedPromise = onceRoomJoinedEvent(socket);
    socket.emit(CLIENT_SOCKET_EVENTS.ROOM_JOIN, { roomId });
    await joinedPromise;

    expect(connectionState.getRoomSubscriptions(socketId)).toEqual([roomId]);

    socket.disconnect();
    await waitForDisconnect(socket);
    await waitForCondition(() => !connectionState.hasConnection(socketId));

    expect(connectionState.getRoomSubscriptions(socketId)).toEqual([]);
  });

  it('idempotent room:join — second join returns room:joined without duplicating subscription', async () => {
    const owner = await registerTestUser(httpServer, { username: 'ws_join_idempotent' });
    const created = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Idempotent Join Room' })
      .expect(201);

    const roomId = (created.body as { id: string }).id;
    const socket = await connectSocket(serverUrl, owner.accessToken);

    try {
      // First join
      const first = onceRoomJoinedEvent(socket);
      socket.emit(CLIENT_SOCKET_EVENTS.ROOM_JOIN, { roomId });
      await first;

      expect(connectionState.getRoomSubscriptions(socket.id ?? '')).toEqual([roomId]);

      // Second join for the same room — should still get room:joined (resync)
      const second = onceRoomJoinedEvent(socket);
      socket.emit(CLIENT_SOCKET_EVENTS.ROOM_JOIN, { roomId });
      const secondEvent = await second;

      expect(secondEvent.roomId).toBe(roomId);
      // Subscription set must not duplicate
      expect(connectionState.getRoomSubscriptions(socket.id ?? '')).toEqual([roomId]);
    } finally {
      socket.disconnect();
      await waitForDisconnect(socket);
    }
  });

  it('rejects an expired token during the handshake', async () => {
    const user = await registerTestUser(httpServer, { username: 'ws_expired' });
    const expired = signExpiredAccessToken(app, user.userId);

    const error = await connectSocketError(serverUrl, expired);

    expect(error.message).toBe('Access token has expired.');
    expect((error as Error & { data?: { code?: string } }).data?.code).toBe(
      AUTH_ERROR_CODES.TOKEN_EXPIRED,
    );
  });

  it('restores the connection after a transport drop and accepts a re-join', async () => {
    const owner = await registerTestUser(httpServer, { username: 'ws_reconnect' });
    const created = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Reconnect Room' })
      .expect(201);

    const roomId = (created.body as { id: string }).id;
    const socket = io(serverUrl, {
      path: '/socket.io',
      transports: ['websocket'],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 50,
      auth: { token: owner.accessToken },
    });

    try {
      const firstConnect = waitForConnect(socket);
      socket.connect();
      await firstConnect;
      const staleSocketId = socket.id ?? '';

      const joined = onceRoomJoinedEvent(socket);
      socket.emit(CLIENT_SOCKET_EVENTS.ROOM_JOIN, { roomId });
      await joined;
      expect(connectionState.getRoomSubscriptions(staleSocketId)).toEqual([roomId]);

      const reconnected = new Promise<void>((resolve, reject) => {
        socket.once('connect', () => resolve());
        socket.once('connect_error', (error) => reject(error));
      });
      socket.io.engine?.close();
      await reconnected;
      const liveSocketId = socket.id ?? '';

      expect(liveSocketId).not.toBe(staleSocketId);
      await waitForCondition(() => !connectionState.hasConnection(staleSocketId));
      expect(connectionState.hasConnection(liveSocketId)).toBe(true);
      expect(connectionState.getRoomSubscriptions(staleSocketId)).toEqual([]);

      const rejoined = onceRoomJoinedEvent(socket);
      socket.emit(CLIENT_SOCKET_EVENTS.ROOM_JOIN, { roomId });
      await rejoined;
      expect(connectionState.getRoomSubscriptions(liveSocketId)).toEqual([roomId]);
    } finally {
      socket.disconnect();
      await waitForDisconnect(socket);
    }
  });

  it('does not drop a live socket when a stale socket disconnects', async () => {
    const owner = await registerTestUser(httpServer, { username: 'ws_stale_socket' });
    const created = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Stale Socket Room' })
      .expect(201);

    const roomId = (created.body as { id: string }).id;
    const stale = await connectSocket(serverUrl, owner.accessToken);
    const live = await connectSocket(serverUrl, owner.accessToken);

    try {
      const staleJoined = onceRoomJoinedEvent(stale);
      stale.emit(CLIENT_SOCKET_EVENTS.ROOM_JOIN, { roomId });
      await staleJoined;

      const liveJoined = onceRoomJoinedEvent(live);
      live.emit(CLIENT_SOCKET_EVENTS.ROOM_JOIN, { roomId });
      await liveJoined;

      const staleId = stale.id ?? '';
      const liveId = live.id ?? '';
      expect(connectionState.countConnectionsForUser(owner.userId)).toBe(2);

      stale.disconnect();
      await waitForDisconnect(stale);
      await waitForCondition(() => !connectionState.hasConnection(staleId));

      expect(connectionState.hasConnection(liveId)).toBe(true);
      expect(connectionState.getRoomSubscriptions(liveId)).toEqual([roomId]);
      expect(connectionState.countConnectionsForUser(owner.userId)).toBe(1);
    } finally {
      live.disconnect();
      await waitForDisconnect(live);
    }
  });

  it('pushes an online presence snapshot to a joining socket', async () => {
    const owner = await registerTestUser(httpServer, { username: 'ws_presence_snap_owner' });
    const member = await registerTestUser(httpServer, { username: 'ws_presence_snap_member' });
    const created = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Presence Snapshot Room' })
      .expect(201);

    const roomId = (created.body as { id: string }).id;
    await request(httpServer)
      .post(`/api/rooms/${roomId}/join`)
      .set(bearerAuthorization(member.accessToken))
      .expect(201);

    const ownerSocket = await connectSocket(serverUrl, owner.accessToken);
    const memberSocket = await connectSocket(serverUrl, member.accessToken);

    try {
      const ownerJoined = onceRoomJoinedEvent(ownerSocket);
      ownerSocket.emit(CLIENT_SOCKET_EVENTS.ROOM_JOIN, { roomId });
      await ownerJoined;

      const presencePromise = new Promise<{ userId: string; lastSeenAt: string }>((resolve) => {
        memberSocket.once(SERVER_SOCKET_EVENTS.USER_ONLINE, (payload) => {
          if (payload.userId === owner.userId) {
            resolve(payload);
          }
        });
      });

      const memberJoined = onceRoomJoinedEvent(memberSocket);
      memberSocket.emit(CLIENT_SOCKET_EVENTS.ROOM_JOIN, { roomId });
      await memberJoined;

      const presence = await presencePromise;
      expect(presence.userId).toBe(owner.userId);
      expect(presence.lastSeenAt).toBeDefined();
    } finally {
      ownerSocket.disconnect();
      memberSocket.disconnect();
      await waitForDisconnect(ownerSocket);
      await waitForDisconnect(memberSocket);
    }
  });

  it('relays typing start and stop to other room members only', async () => {
    const owner = await registerTestUser(httpServer, { username: 'ws_typing_owner' });
    const member = await registerTestUser(httpServer, { username: 'ws_typing_member' });
    const created = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Typing Room' })
      .expect(201);
    const roomId = (created.body as { id: string }).id;

    await request(httpServer)
      .post(`/api/rooms/${roomId}/join`)
      .set(bearerAuthorization(member.accessToken))
      .expect(201);

    const typer = await connectSocket(serverUrl, owner.accessToken);
    const observer = await connectSocket(serverUrl, member.accessToken);

    try {
      const typerJoined = onceRoomJoinedEvent(typer);
      typer.emit(CLIENT_SOCKET_EVENTS.ROOM_JOIN, { roomId });
      await typerJoined;

      const observerJoined = onceRoomJoinedEvent(observer);
      observer.emit(CLIENT_SOCKET_EVENTS.ROOM_JOIN, { roomId });
      await observerJoined;

      const started = new Promise<{ roomId: string; userId: string }>((resolve) => {
        observer.once(SERVER_SOCKET_EVENTS.TYPING_STARTED, (payload) => resolve(payload));
      });
      let typerSawOwnStart = false;
      typer.once(SERVER_SOCKET_EVENTS.TYPING_STARTED, () => {
        typerSawOwnStart = true;
      });

      typer.emit(CLIENT_SOCKET_EVENTS.TYPING_START, { roomId });
      await expect(started).resolves.toEqual({ roomId, userId: owner.userId });

      const stopped = new Promise<{ roomId: string; userId: string }>((resolve) => {
        observer.once(SERVER_SOCKET_EVENTS.TYPING_STOPPED, (payload) => resolve(payload));
      });
      typer.emit(CLIENT_SOCKET_EVENTS.TYPING_STOP, { roomId });
      await expect(stopped).resolves.toEqual({ roomId, userId: owner.userId });
      expect(typerSawOwnStart).toBe(false);
    } finally {
      typer.disconnect();
      observer.disconnect();
      await waitForDisconnect(typer);
      await waitForDisconnect(observer);
    }
  });

  it('rejects typing events from users who are not room members', async () => {
    const owner = await registerTestUser(httpServer, { username: 'ws_typing_auth_owner' });
    const outsider = await registerTestUser(httpServer, { username: 'ws_typing_auth_out' });
    const created = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Typing Auth' })
      .expect(201);
    const roomId = (created.body as { id: string }).id;

    const socket = await connectSocket(serverUrl, outsider.accessToken);
    try {
      const errorPromise = onceSocketErrorEvent(socket);
      socket.emit(CLIENT_SOCKET_EVENTS.TYPING_START, { roomId });
      await expect(errorPromise).resolves.toMatchObject({ code: ROOM_ERROR_CODES.NOT_A_MEMBER });
    } finally {
      socket.disconnect();
      await waitForDisconnect(socket);
    }
  });
});

function createSocket(
  serverUrl: string,
  token?: string,
): Socket<ServerToClientEvents, ClientToServerEvents> {
  return io(serverUrl, {
    path: '/socket.io',
    transports: ['websocket'],
    autoConnect: false,
    ...(token !== undefined ? { auth: { token } } : {}),
  });
}

function waitForConnect(socket: Socket<ServerToClientEvents, ClientToServerEvents>): Promise<void> {
  if (socket.connected) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', (error) => reject(error));
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

function connectSocketError(serverUrl: string, token?: string): Promise<Error> {
  return new Promise((resolve) => {
    const socket = createSocket(serverUrl, token);
    socket.once('connect_error', (error) => {
      socket.close();
      resolve(error);
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

function onceRoomJoinedEvent(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
): Promise<RoomJoinedEvent> {
  return new Promise((resolve) => {
    socket.once(SERVER_SOCKET_EVENTS.ROOM_JOINED, (payload: RoomJoinedEvent) => resolve(payload));
  });
}

function onceRoomLeftEvent(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
): Promise<RoomLeftEvent> {
  return new Promise((resolve) => {
    socket.once(SERVER_SOCKET_EVENTS.ROOM_LEFT, (payload: RoomLeftEvent) => resolve(payload));
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

async function waitForCondition(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();

  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Condition was not met in time.');
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
