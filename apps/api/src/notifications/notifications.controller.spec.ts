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
  type NotificationNewEvent,
  type ServerToClientEvents,
} from '@pulse-chat/shared';

import { AppModule } from '../app.module.js';
import { configureApplication } from '../bootstrap/configure-application.js';
import { AppConfigService } from '../config/index.js';
import { RedisService } from '../infrastructure/redis/redis.service.js';
import { bearerAuthorization, registerTestUser } from '../test/auth-test.helpers.js';
import { startMongoMemoryServer, stopMongoMemoryServer } from '../test/mongo-memory.js';
import { TestRedisService } from '../test/test-redis.service.js';

describe('Notifications API', () => {
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

  // ---------------------------------------------------------------------------
  // GET /api/notifications
  // ---------------------------------------------------------------------------

  it('returns an empty list when the user has no notifications', async () => {
    const user = await registerTestUser(httpServer, { username: 'notif_empty' });

    const response = await request(httpServer)
      .get('/api/notifications')
      .set(bearerAuthorization(user.accessToken))
      .expect(200);

    expect(response.body).toMatchObject({ items: [] });
  });

  it('requires authentication to list notifications', async () => {
    await request(httpServer).get('/api/notifications').expect(401);
  });

  // ---------------------------------------------------------------------------
  // Mention notifications via WebSocket message:send
  // ---------------------------------------------------------------------------

  it('creates a mention notification when a message contains @username', async () => {
    const author = await registerTestUser(httpServer, { username: 'notif_mention_author' });
    const mentioned = await registerTestUser(httpServer, { username: 'notif_mention_target' });
    const roomId = await createPublicRoom(httpServer, author.accessToken, 'Mention Room');

    await request(httpServer)
      .post(`/api/rooms/${roomId}/join`)
      .set(bearerAuthorization(mentioned.accessToken))
      .expect(201);

    const authorSocket = await connectSocket(serverUrl, author.accessToken);
    try {
      await joinRoom(authorSocket, roomId);

      authorSocket.emit(CLIENT_SOCKET_EVENTS.MESSAGE_SEND, {
        roomId,
        content: 'Hey @notif_mention_target!',
        clientMessageId: 'notif-mention-1',
      });

      await onceMessageNewEvent(authorSocket);
      const items = await waitForNotifications(httpServer, mentioned.accessToken, 1);

      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        type: NOTIFICATION_TYPES.MENTION,
        actorId: author.userId,
        isRead: false,
      });
    } finally {
      authorSocket.disconnect();
      await waitForDisconnect(authorSocket);
    }
  });

  it('does not create a duplicate notification for the same mention', async () => {
    const author = await registerTestUser(httpServer, { username: 'notif_dedup_author' });
    const mentioned = await registerTestUser(httpServer, { username: 'notif_dedup_target' });
    const roomId = await createPublicRoom(httpServer, author.accessToken, 'Dedup Room');

    await request(httpServer)
      .post(`/api/rooms/${roomId}/join`)
      .set(bearerAuthorization(mentioned.accessToken))
      .expect(201);

    const authorSocket = await connectSocket(serverUrl, author.accessToken);
    try {
      await joinRoom(authorSocket, roomId);

      // Send two messages both mentioning the same user.
      for (const clientMessageId of ['dedup-1', 'dedup-2']) {
        authorSocket.emit(CLIENT_SOCKET_EVENTS.MESSAGE_SEND, {
          roomId,
          content: 'Hey @notif_dedup_target!',
          clientMessageId,
        });
        await onceMessageNewEvent(authorSocket);
      }

      expect(await waitForNotifications(httpServer, mentioned.accessToken, 2)).toHaveLength(2);
    } finally {
      authorSocket.disconnect();
      await waitForDisconnect(authorSocket);
    }
  });

  // ---------------------------------------------------------------------------
  // Reply notifications
  // ---------------------------------------------------------------------------

  it('creates a reply notification for the original message author', async () => {
    const author = await registerTestUser(httpServer, { username: 'notif_reply_author' });
    const replier = await registerTestUser(httpServer, { username: 'notif_reply_replier' });
    const roomId = await createPublicRoom(httpServer, author.accessToken, 'Reply Room');

    await request(httpServer)
      .post(`/api/rooms/${roomId}/join`)
      .set(bearerAuthorization(replier.accessToken))
      .expect(201);

    const authorSocket = await connectSocket(serverUrl, author.accessToken);
    const replierSocket = await connectSocket(serverUrl, replier.accessToken);

    try {
      await joinRoom(authorSocket, roomId);
      await joinRoom(replierSocket, roomId);

      const originalPromise = onceMessageNewEvent(authorSocket);
      authorSocket.emit(CLIENT_SOCKET_EVENTS.MESSAGE_SEND, {
        roomId,
        content: 'Original message',
        clientMessageId: 'reply-original',
      });
      const original = await originalPromise;
      const originalMessageId = original.message.id;

      replierSocket.emit(CLIENT_SOCKET_EVENTS.MESSAGE_SEND, {
        roomId,
        content: 'A reply',
        clientMessageId: 'reply-reply',
        replyToMessageId: originalMessageId,
      });
      await onceMessageNewEvent(replierSocket);
      const items = await waitForNotifications(httpServer, author.accessToken, 1);

      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        type: NOTIFICATION_TYPES.REPLY,
        actorId: replier.userId,
        referenceId: expect.any(String) as string,
        isRead: false,
      });
    } finally {
      authorSocket.disconnect();
      replierSocket.disconnect();
      await waitForDisconnect(authorSocket);
      await waitForDisconnect(replierSocket);
    }
  });

  it('does not create a reply notification when the replier is the original author', async () => {
    const author = await registerTestUser(httpServer, { username: 'notif_self_reply' });
    const roomId = await createPublicRoom(httpServer, author.accessToken, 'Self Reply Room');
    const socket = await connectSocket(serverUrl, author.accessToken);

    try {
      await joinRoom(socket, roomId);

      const originalPromise = onceMessageNewEvent(socket);
      socket.emit(CLIENT_SOCKET_EVENTS.MESSAGE_SEND, {
        roomId,
        content: 'Original',
        clientMessageId: 'self-reply-1',
      });
      const original = await originalPromise;

      socket.emit(CLIENT_SOCKET_EVENTS.MESSAGE_SEND, {
        roomId,
        content: 'Self reply',
        clientMessageId: 'self-reply-2',
        replyToMessageId: original.message.id,
      });
      await onceMessageNewEvent(socket);
      await delay(300);

      const response = await request(httpServer)
        .get('/api/notifications')
        .set(bearerAuthorization(author.accessToken))
        .expect(200);

      expect((response.body as { items: unknown[] }).items).toHaveLength(0);
    } finally {
      socket.disconnect();
      await waitForDisconnect(socket);
    }
  });

  it('does not notify a former member when someone replies to their old message', async () => {
    const owner = await registerTestUser(httpServer, { username: 'notif_left_owner' });
    const author = await registerTestUser(httpServer, { username: 'notif_left_author' });
    const roomId = await createPublicRoom(httpServer, owner.accessToken, 'Left Reply Room');

    await request(httpServer)
      .post(`/api/rooms/${roomId}/join`)
      .set(bearerAuthorization(author.accessToken))
      .expect(201);

    const original = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(author.accessToken))
      .send({ content: 'I will leave', clientMessageId: 'left-original' })
      .expect(201);

    await request(httpServer)
      .post(`/api/rooms/${roomId}/leave`)
      .set(bearerAuthorization(author.accessToken))
      .expect(204);

    await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .send({
        content: 'Reply after leave',
        clientMessageId: 'left-reply',
        replyToMessageId: (original.body as { id: string }).id,
      })
      .expect(201);

    await delay(300);

    const response = await request(httpServer)
      .get('/api/notifications')
      .set(bearerAuthorization(author.accessToken))
      .expect(200);

    expect((response.body as { items: unknown[] }).items).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Direct message notifications
  // ---------------------------------------------------------------------------

  it('creates a direct_message notification for the peer in a DM room', async () => {
    const userA = await registerTestUser(httpServer, { username: 'notif_dm_a' });
    const userB = await registerTestUser(httpServer, { username: 'notif_dm_b' });

    const roomRes = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(userA.accessToken))
      .send({ type: ROOM_TYPES.DIRECT, name: 'DM', peerUserId: userB.userId })
      .expect(201);
    const roomId = (roomRes.body as { id: string }).id;

    const socketA = await connectSocket(serverUrl, userA.accessToken);
    try {
      await joinRoom(socketA, roomId);

      socketA.emit(CLIENT_SOCKET_EVENTS.MESSAGE_SEND, {
        roomId,
        content: 'Hey B!',
        clientMessageId: 'dm-1',
      });
      await onceMessageNewEvent(socketA);
      const items = await waitForNotifications(httpServer, userB.accessToken, 1);

      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        type: NOTIFICATION_TYPES.DIRECT_MESSAGE,
        actorId: userA.userId,
        isRead: false,
      });
    } finally {
      socketA.disconnect();
      await waitForDisconnect(socketA);
    }
  });

  // ---------------------------------------------------------------------------
  // Room invitation notifications
  // ---------------------------------------------------------------------------

  it('creates a room_invitation notification when a user is added to a private room', async () => {
    const owner = await registerTestUser(httpServer, { username: 'notif_inv_owner' });
    const invited = await registerTestUser(httpServer, { username: 'notif_inv_target' });

    const roomRes = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PRIVATE, name: 'Invite Room' })
      .expect(201);
    const roomId = (roomRes.body as { id: string }).id;

    await request(httpServer)
      .post(`/api/rooms/${roomId}/members`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ userId: invited.userId })
      .expect(201);

    const items = await waitForNotifications(httpServer, invited.accessToken, 1);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: NOTIFICATION_TYPES.ROOM_INVITATION,
      actorId: owner.userId,
      referenceId: roomId,
      isRead: false,
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/notifications/:id/read
  // ---------------------------------------------------------------------------

  it('marks a single notification as read', async () => {
    const author = await registerTestUser(httpServer, { username: 'notif_read_author' });
    const reader = await registerTestUser(httpServer, { username: 'notif_read_target' });
    const roomId = await createPublicRoom(httpServer, author.accessToken, 'Read Room');

    await request(httpServer)
      .post(`/api/rooms/${roomId}/join`)
      .set(bearerAuthorization(reader.accessToken))
      .expect(201);

    const socket = await connectSocket(serverUrl, author.accessToken);
    try {
      await joinRoom(socket, roomId);

      socket.emit(CLIENT_SOCKET_EVENTS.MESSAGE_SEND, {
        roomId,
        content: 'Hey @notif_read_target',
        clientMessageId: 'read-me',
      });
      await onceMessageNewEvent(socket);
      const items = await waitForNotifications(httpServer, reader.accessToken, 1);

      const notifId = (items[0] as { id: string } | undefined)?.id ?? '';
      expect(notifId).not.toBe('');

      const readRes = await request(httpServer)
        .post(`/api/notifications/${notifId}/read`)
        .set(bearerAuthorization(reader.accessToken))
        .expect(200);

      expect((readRes.body as { isRead: boolean }).isRead).toBe(true);
    } finally {
      socket.disconnect();
      await waitForDisconnect(socket);
    }
  });

  it("returns 404 when trying to mark another user's notification as read", async () => {
    const author = await registerTestUser(httpServer, { username: 'notif_read_403_author' });
    const target = await registerTestUser(httpServer, { username: 'notif_read_403_target' });
    const outsider = await registerTestUser(httpServer, { username: 'notif_read_403_outsider' });
    const roomId = await createPublicRoom(httpServer, author.accessToken, 'Read 403 Room');

    await request(httpServer)
      .post(`/api/rooms/${roomId}/join`)
      .set(bearerAuthorization(target.accessToken))
      .expect(201);

    const socket = await connectSocket(serverUrl, author.accessToken);
    try {
      await joinRoom(socket, roomId);
      socket.emit(CLIENT_SOCKET_EVENTS.MESSAGE_SEND, {
        roomId,
        content: 'Hey @notif_read_403_target',
        clientMessageId: 'read-403',
      });
      await onceMessageNewEvent(socket);
      const targetItems = await waitForNotifications(httpServer, target.accessToken, 1);

      const notifId = (targetItems[0] as { id: string } | undefined)?.id ?? '';
      expect(notifId).not.toBe('');

      await request(httpServer)
        .post(`/api/notifications/${notifId}/read`)
        .set(bearerAuthorization(outsider.accessToken))
        .expect(404);
    } finally {
      socket.disconnect();
      await waitForDisconnect(socket);
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/notifications/read-all
  // ---------------------------------------------------------------------------

  it('marks all notifications as read', async () => {
    const author = await registerTestUser(httpServer, { username: 'notif_readall_author' });
    const reader = await registerTestUser(httpServer, { username: 'notif_readall_target' });
    const roomId = await createPublicRoom(httpServer, author.accessToken, 'Read-All Room');

    await request(httpServer)
      .post(`/api/rooms/${roomId}/join`)
      .set(bearerAuthorization(reader.accessToken))
      .expect(201);

    const socket = await connectSocket(serverUrl, author.accessToken);
    try {
      await joinRoom(socket, roomId);

      for (const clientMessageId of ['readall-1', 'readall-2']) {
        socket.emit(CLIENT_SOCKET_EVENTS.MESSAGE_SEND, {
          roomId,
          content: 'Hey @notif_readall_target',
          clientMessageId,
        });
        await onceMessageNewEvent(socket);
      }
      await waitForNotifications(httpServer, reader.accessToken, 2);

      await request(httpServer)
        .post('/api/notifications/read-all')
        .set(bearerAuthorization(reader.accessToken))
        .expect(204);

      const listRes = await request(httpServer)
        .get('/api/notifications')
        .set(bearerAuthorization(reader.accessToken))
        .expect(200);

      const items = (listRes.body as { items: { isRead: boolean }[] }).items;
      expect(items.length).toBeGreaterThanOrEqual(2);
      expect(items.every((item) => item.isRead)).toBe(true);
    } finally {
      socket.disconnect();
      await waitForDisconnect(socket);
    }
  });

  // ---------------------------------------------------------------------------
  // Real-time notification:new event
  // ---------------------------------------------------------------------------

  it('delivers notification:new over WebSocket when the user is connected', async () => {
    const author = await registerTestUser(httpServer, { username: 'notif_rt_author' });
    const receiver = await registerTestUser(httpServer, { username: 'notif_rt_receiver' });
    const roomId = await createPublicRoom(httpServer, author.accessToken, 'RT Notif Room');

    await request(httpServer)
      .post(`/api/rooms/${roomId}/join`)
      .set(bearerAuthorization(receiver.accessToken))
      .expect(201);

    const authorSocket = await connectSocket(serverUrl, author.accessToken);
    const receiverSocket = await connectSocket(serverUrl, receiver.accessToken);

    try {
      await joinRoom(authorSocket, roomId);

      const notifPromise = onceNotificationNewEvent(receiverSocket, receiver.userId);

      authorSocket.emit(CLIENT_SOCKET_EVENTS.MESSAGE_SEND, {
        roomId,
        content: 'Hey @notif_rt_receiver',
        clientMessageId: 'rt-notif-1',
      });

      const notifEvent = await notifPromise;
      expect(notifEvent.notification).toMatchObject({
        userId: receiver.userId,
        type: NOTIFICATION_TYPES.MENTION,
        actorId: author.userId,
        isRead: false,
      });
    } finally {
      authorSocket.disconnect();
      receiverSocket.disconnect();
      await waitForDisconnect(authorSocket);
      await waitForDisconnect(receiverSocket);
    }
  });

  // ---------------------------------------------------------------------------
  // Pagination
  // ---------------------------------------------------------------------------

  it('paginates notifications using the nextCursor', async () => {
    const author = await registerTestUser(httpServer, { username: 'notif_page_author' });
    const target = await registerTestUser(httpServer, { username: 'notif_page_target' });
    const roomId = await createPublicRoom(httpServer, author.accessToken, 'Page Room');

    await request(httpServer)
      .post(`/api/rooms/${roomId}/join`)
      .set(bearerAuthorization(target.accessToken))
      .expect(201);

    const socket = await connectSocket(serverUrl, author.accessToken);
    try {
      await joinRoom(socket, roomId);

      // Create 3 mention notifications.
      for (let i = 0; i < 3; i++) {
        socket.emit(CLIENT_SOCKET_EVENTS.MESSAGE_SEND, {
          roomId,
          content: 'Hey @notif_page_target',
          clientMessageId: `page-${String(i)}`,
        });
        await onceMessageNewEvent(socket);
      }
      await waitForNotifications(httpServer, target.accessToken, 3);

      const page1 = await request(httpServer)
        .get('/api/notifications?limit=2')
        .set(bearerAuthorization(target.accessToken))
        .expect(200);

      const body1 = page1.body as { items: unknown[]; nextCursor?: string };
      expect(body1.items).toHaveLength(2);
      expect(body1.nextCursor).toBeDefined();

      const page2 = await request(httpServer)
        .get(`/api/notifications?limit=2&before=${body1.nextCursor}`)
        .set(bearerAuthorization(target.accessToken))
        .expect(200);

      const body2 = page2.body as { items: unknown[]; nextCursor?: string };
      expect(body2.items).toHaveLength(1);
      expect(body2.nextCursor).toBeUndefined();
    } finally {
      socket.disconnect();
      await waitForDisconnect(socket);
    }
  });

  it('rejects invalid pagination parameters', async () => {
    const user = await registerTestUser(httpServer, { username: 'notif_invalid_page' });

    await request(httpServer)
      .get('/api/notifications?limit=999')
      .set(bearerAuthorization(user.accessToken))
      .expect(400);

    await request(httpServer)
      .get('/api/notifications?limit=0')
      .set(bearerAuthorization(user.accessToken))
      .expect(400);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
): Promise<{ message: { id: string } }> {
  return new Promise((resolve) => {
    socket.once(SERVER_SOCKET_EVENTS.MESSAGE_NEW, (payload) =>
      resolve(payload as { message: { id: string } }),
    );
  });
}

function onceNotificationNewEvent(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  userId: string,
): Promise<NotificationNewEvent> {
  return new Promise((resolve) => {
    const handler = (payload: NotificationNewEvent): void => {
      if (payload.notification.userId === userId) {
        socket.off(SERVER_SOCKET_EVENTS.NOTIFICATION_NEW, handler);
        resolve(payload);
      }
    };
    socket.on(SERVER_SOCKET_EVENTS.NOTIFICATION_NEW, handler);
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

/** Poll until fire-and-forget notification writes are visible over REST. */
async function waitForNotifications(
  httpServer: HttpServer,
  accessToken: string,
  expectedCount: number,
  timeoutMs = 5_000,
): Promise<unknown[]> {
  const deadline = Date.now() + timeoutMs;
  let items: unknown[] = [];

  while (Date.now() < deadline) {
    const response = await request(httpServer)
      .get('/api/notifications')
      .set(bearerAuthorization(accessToken))
      .expect(200);
    items = (response.body as { items: unknown[] }).items;
    if (items.length >= expectedCount) {
      return items;
    }
    await delay(50);
  }

  return items;
}
