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
  MESSAGE_MAX_LENGTH,
  ROOM_ERROR_CODES,
  ROOM_TYPES,
  SERVER_SOCKET_EVENTS,
  type ClientToServerEvents,
  type MessageDeletedEvent,
  type MessageNewEvent,
  type MessageUpdatedEvent,
  type ReactionChangedEvent,
  type ServerToClientEvents,
} from '@pulse-chat/shared';

import { AppModule } from '../app.module.js';
import { configureApplication } from '../bootstrap/configure-application.js';
import { AppConfigService } from '../config/index.js';
import { RedisService } from '../infrastructure/redis/redis.service.js';
import { bearerAuthorization, registerTestUser } from '../test/auth-test.helpers.js';
import { startMongoMemoryServer, stopMongoMemoryServer } from '../test/mongo-memory.js';
import { TestRedisService } from '../test/test-redis.service.js';

describe('Realtime messaging', () => {
  let moduleRef: TestingModule;
  let app: NestExpressApplication;
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

    httpServer = app.getHttpServer();
    const address = httpServer.address() as AddressInfo;
    serverUrl = `http://127.0.0.1:${String(address.port)}`;
  });

  afterAll(async () => {
    await app?.close();
    await moduleRef?.close();
    await stopMongoMemoryServer();
  });

  it('broadcasts message:new to another subscribed client in the same room', async () => {
    const owner = await registerTestUser(httpServer, { username: 'rt_msg_owner' });
    const member = await registerTestUser(httpServer, { username: 'rt_msg_member' });
    const roomId = await createPublicRoom(httpServer, owner.accessToken, 'Messaging Room');

    await request(httpServer)
      .post(`/api/rooms/${roomId}/join`)
      .set(bearerAuthorization(member.accessToken))
      .expect(201);

    const sender = await connectSocket(serverUrl, owner.accessToken);
    const receiver = await connectSocket(serverUrl, member.accessToken);

    try {
      await joinRoom(sender, roomId);
      await joinRoom(receiver, roomId);

      const receivedPromise = onceMessageNewEvent(receiver);
      sender.emit(CLIENT_SOCKET_EVENTS.MESSAGE_SEND, {
        roomId,
        content: 'Hello from realtime',
        clientMessageId: 'client-realtime-1',
      });

      const received = await receivedPromise;
      expect(received.message).toMatchObject({
        roomId,
        authorId: owner.userId,
        content: 'Hello from realtime',
        clientMessageId: 'client-realtime-1',
      });
      expect(received.message).not.toHaveProperty('passwordHash');
      expect(received.message).not.toHaveProperty('_id');
    } finally {
      sender.disconnect();
      receiver.disconnect();
      await waitForDisconnect(sender);
      await waitForDisconnect(receiver);
    }
  });

  it('delivers message:new to the sender when they are subscribed to the room', async () => {
    const owner = await registerTestUser(httpServer, { username: 'rt_msg_sender_echo' });
    const roomId = await createPublicRoom(httpServer, owner.accessToken, 'Echo Room');
    const socket = await connectSocket(serverUrl, owner.accessToken);

    try {
      await joinRoom(socket, roomId);

      const receivedPromise = onceMessageNewEvent(socket);
      socket.emit(CLIENT_SOCKET_EVENTS.MESSAGE_SEND, {
        roomId,
        content: 'Echo test',
        clientMessageId: 'client-echo-1',
      });

      const received = await receivedPromise;
      expect(received.message.content).toBe('Echo test');
    } finally {
      socket.disconnect();
      await waitForDisconnect(socket);
    }
  });

  it('does not deliver message:new to members who have not joined the realtime room', async () => {
    const owner = await registerTestUser(httpServer, { username: 'rt_msg_unsub_owner' });
    const member = await registerTestUser(httpServer, { username: 'rt_msg_unsub_member' });
    const roomId = await createPublicRoom(httpServer, owner.accessToken, 'Unsubscribed Room');

    await request(httpServer)
      .post(`/api/rooms/${roomId}/join`)
      .set(bearerAuthorization(member.accessToken))
      .expect(201);

    const sender = await connectSocket(serverUrl, owner.accessToken);
    const unsubscribedMember = await connectSocket(serverUrl, member.accessToken);

    try {
      await joinRoom(sender, roomId);

      let received = false;
      unsubscribedMember.on(SERVER_SOCKET_EVENTS.MESSAGE_NEW, () => {
        received = true;
      });

      sender.emit(CLIENT_SOCKET_EVENTS.MESSAGE_SEND, {
        roomId,
        content: 'Members only broadcast',
        clientMessageId: 'client-unsub-1',
      });

      await onceMessageNewEvent(sender);
      await delay(150);
      expect(received).toBe(false);
    } finally {
      sender.disconnect();
      unsubscribedMember.disconnect();
      await waitForDisconnect(sender);
      await waitForDisconnect(unsubscribedMember);
    }
  });

  it('rejects message:send from non-members', async () => {
    const owner = await registerTestUser(httpServer, { username: 'rt_msg_nonmember_owner' });
    const outsider = await registerTestUser(httpServer, { username: 'rt_msg_nonmember_outsider' });
    const roomId = await createPublicRoom(httpServer, owner.accessToken, 'Closed Room');
    const socket = await connectSocket(serverUrl, outsider.accessToken);

    try {
      const errorPromise = onceSocketErrorEvent(socket);
      socket.emit(CLIENT_SOCKET_EVENTS.MESSAGE_SEND, {
        roomId,
        content: 'Should fail',
        clientMessageId: 'client-fail-1',
      });
      const error = await errorPromise;

      expect(error).toMatchObject({ code: ROOM_ERROR_CODES.NOT_A_MEMBER });
    } finally {
      socket.disconnect();
      await waitForDisconnect(socket);
    }
  });

  it('rejects oversized and malformed message payloads', async () => {
    const owner = await registerTestUser(httpServer, { username: 'rt_msg_validation' });
    const roomId = await createPublicRoom(httpServer, owner.accessToken, 'Validation Room');
    const socket = await connectSocket(serverUrl, owner.accessToken);

    try {
      const emptyPromise = onceSocketErrorEvent(socket);
      socket.emit(CLIENT_SOCKET_EVENTS.MESSAGE_SEND, {
        roomId,
        content: '   ',
        clientMessageId: 'client-empty',
      });
      expect(await emptyPromise).toMatchObject({ code: API_ERROR_CODES.VALIDATION_FAILED });

      const oversizedPromise = onceSocketErrorEvent(socket);
      socket.emit(CLIENT_SOCKET_EVENTS.MESSAGE_SEND, {
        roomId,
        content: 'x'.repeat(MESSAGE_MAX_LENGTH + 1),
        clientMessageId: 'client-long',
      });
      expect(await oversizedPromise).toMatchObject({ code: API_ERROR_CODES.VALIDATION_FAILED });

      const malformedPromise = onceSocketErrorEvent(socket);
      socket.emit(CLIENT_SOCKET_EVENTS.MESSAGE_SEND, {
        roomId: 'bad-id',
        content: 'Hello',
        clientMessageId: 'client-bad-room',
      });
      expect(await malformedPromise).toMatchObject({ code: API_ERROR_CODES.VALIDATION_FAILED });
    } finally {
      socket.disconnect();
      await waitForDisconnect(socket);
    }
  });

  it('does not rebroadcast message:new for duplicate clientMessageId retries', async () => {
    const owner = await registerTestUser(httpServer, { username: 'rt_msg_idempotent_owner' });
    const member = await registerTestUser(httpServer, { username: 'rt_msg_idempotent_member' });
    const roomId = await createPublicRoom(httpServer, owner.accessToken, 'Idempotent Room');

    await request(httpServer)
      .post(`/api/rooms/${roomId}/join`)
      .set(bearerAuthorization(member.accessToken))
      .expect(201);

    const sender = await connectSocket(serverUrl, owner.accessToken);
    const receiver = await connectSocket(serverUrl, member.accessToken);

    try {
      await joinRoom(sender, roomId);
      await joinRoom(receiver, roomId);

      const firstReceived = onceMessageNewEvent(receiver);
      sender.emit(CLIENT_SOCKET_EVENTS.MESSAGE_SEND, {
        roomId,
        content: 'Once',
        clientMessageId: 'client-once',
      });
      await firstReceived;

      let broadcastCount = 0;
      receiver.on(SERVER_SOCKET_EVENTS.MESSAGE_NEW, () => {
        broadcastCount += 1;
      });

      sender.emit(CLIENT_SOCKET_EVENTS.MESSAGE_SEND, {
        roomId,
        content: 'Once again',
        clientMessageId: 'client-once',
      });

      await delay(150);
      expect(broadcastCount).toBe(0);
    } finally {
      sender.disconnect();
      receiver.disconnect();
      await waitForDisconnect(sender);
      await waitForDisconnect(receiver);
    }
  });

  it('broadcasts message:updated to subscribed clients after a REST edit', async () => {
    const owner = await registerTestUser(httpServer, { username: 'rt_msg_edit_owner' });
    const member = await registerTestUser(httpServer, { username: 'rt_msg_edit_member' });
    const roomId = await createPublicRoom(httpServer, owner.accessToken, 'Edit Room');

    await request(httpServer)
      .post(`/api/rooms/${roomId}/join`)
      .set(bearerAuthorization(member.accessToken))
      .expect(201);

    const ownerSocket = await connectSocket(serverUrl, owner.accessToken);
    const memberSocket = await connectSocket(serverUrl, member.accessToken);

    try {
      await joinRoom(ownerSocket, roomId);
      await joinRoom(memberSocket, roomId);

      const createdPromise = onceMessageNewEvent(ownerSocket);
      ownerSocket.emit(CLIENT_SOCKET_EVENTS.MESSAGE_SEND, {
        roomId,
        content: 'Original',
        clientMessageId: 'client-edit-1',
      });
      const created = await createdPromise;

      const memberUpdatedPromise = onceMessageUpdatedEvent(memberSocket);
      const ownerUpdatedPromise = onceMessageUpdatedEvent(ownerSocket);

      await request(httpServer)
        .patch(`/api/messages/${created.message.id}`)
        .set(bearerAuthorization(owner.accessToken))
        .send({ content: 'Edited content' })
        .expect(200);

      const [memberUpdated, ownerUpdated] = await Promise.all([
        memberUpdatedPromise,
        ownerUpdatedPromise,
      ]);

      expect(memberUpdated.message).toMatchObject({
        id: created.message.id,
        content: 'Edited content',
      });
      expect(memberUpdated.message.editedAt).toBeDefined();
      expect(ownerUpdated.message.content).toBe('Edited content');
    } finally {
      ownerSocket.disconnect();
      memberSocket.disconnect();
      await waitForDisconnect(ownerSocket);
      await waitForDisconnect(memberSocket);
    }
  });

  it('broadcasts message:deleted with redacted content after a REST delete', async () => {
    const owner = await registerTestUser(httpServer, { username: 'rt_msg_delete_owner' });
    const member = await registerTestUser(httpServer, { username: 'rt_msg_delete_member' });
    const roomId = await createPublicRoom(httpServer, owner.accessToken, 'Delete Room');

    await request(httpServer)
      .post(`/api/rooms/${roomId}/join`)
      .set(bearerAuthorization(member.accessToken))
      .expect(201);

    const ownerSocket = await connectSocket(serverUrl, owner.accessToken);
    const memberSocket = await connectSocket(serverUrl, member.accessToken);

    try {
      await joinRoom(ownerSocket, roomId);
      await joinRoom(memberSocket, roomId);

      const createdPromise = onceMessageNewEvent(ownerSocket);
      ownerSocket.emit(CLIENT_SOCKET_EVENTS.MESSAGE_SEND, {
        roomId,
        content: 'Delete me',
        clientMessageId: 'client-delete-1',
      });
      const created = await createdPromise;

      const memberDeletedPromise = onceMessageDeletedEvent(memberSocket);
      const ownerDeletedPromise = onceMessageDeletedEvent(ownerSocket);

      await request(httpServer)
        .delete(`/api/messages/${created.message.id}`)
        .set(bearerAuthorization(owner.accessToken))
        .expect(204);

      const [memberDeleted, ownerDeleted] = await Promise.all([
        memberDeletedPromise,
        ownerDeletedPromise,
      ]);

      expect(memberDeleted.message).toMatchObject({
        id: created.message.id,
        roomId,
        content: '',
      });
      expect(memberDeleted.message.deletedAt).toBeDefined();
      expect(ownerDeleted.message.deletedAt).toBeDefined();
    } finally {
      ownerSocket.disconnect();
      memberSocket.disconnect();
      await waitForDisconnect(ownerSocket);
      await waitForDisconnect(memberSocket);
    }
  });

  it('returns message not found errors for editing unknown messages without broadcasting', async () => {
    const owner = await registerTestUser(httpServer, { username: 'rt_msg_missing_owner' });
    const roomId = await createPublicRoom(httpServer, owner.accessToken, 'Missing Room');
    const socket = await connectSocket(serverUrl, owner.accessToken);

    try {
      await joinRoom(socket, roomId);

      let updated = false;
      socket.on(SERVER_SOCKET_EVENTS.MESSAGE_UPDATED, () => {
        updated = true;
      });

      await request(httpServer)
        .patch('/api/messages/507f1f77bcf86cd799439099')
        .set(bearerAuthorization(owner.accessToken))
        .send({ content: 'Nope' })
        .expect(404);

      await delay(100);
      expect(updated).toBe(false);
    } finally {
      socket.disconnect();
      await waitForDisconnect(socket);
    }
  });

  it('broadcasts reaction:added and reaction:removed to subscribed clients', async () => {
    const owner = await registerTestUser(httpServer, { username: 'rt_react_owner' });
    const member = await registerTestUser(httpServer, { username: 'rt_react_member' });
    const roomId = await createPublicRoom(httpServer, owner.accessToken, 'Reaction Room');

    await request(httpServer)
      .post(`/api/rooms/${roomId}/join`)
      .set(bearerAuthorization(member.accessToken))
      .expect(201);

    const created = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ content: 'React to this', clientMessageId: 'rt-react-1' })
      .expect(201);
    const messageId = (created.body as { id: string }).id;

    const observer = await connectSocket(serverUrl, member.accessToken);
    try {
      await joinRoom(observer, roomId);

      const added = new Promise<ReactionChangedEvent>((resolve) => {
        observer.once(SERVER_SOCKET_EVENTS.REACTION_ADDED, (payload) => resolve(payload));
      });

      await request(httpServer)
        .post(`/api/messages/${messageId}/reactions`)
        .set(bearerAuthorization(owner.accessToken))
        .send({ emoji: '👍' })
        .expect(201);

      const addedEvent = await added;
      expect(addedEvent).toMatchObject({
        roomId,
        emoji: '👍',
        userId: owner.userId,
      });
      expect(addedEvent.message.reactions).toEqual(
        expect.arrayContaining([expect.objectContaining({ emoji: '👍', count: 1 })]),
      );

      const removed = new Promise<ReactionChangedEvent>((resolve) => {
        observer.once(SERVER_SOCKET_EVENTS.REACTION_REMOVED, (payload) => resolve(payload));
      });

      await request(httpServer)
        .post(`/api/messages/${messageId}/reactions`)
        .set(bearerAuthorization(owner.accessToken))
        .send({ emoji: '👍' })
        .expect(201);

      const removedEvent = await removed;
      expect(removedEvent.emoji).toBe('👍');
      expect(removedEvent.message.reactions).toEqual([]);
    } finally {
      observer.disconnect();
      await waitForDisconnect(observer);
    }
  });

  it('stops delivering room events after a member is removed', async () => {
    const owner = await registerTestUser(httpServer, { username: 'rt_kick_owner' });
    const member = await registerTestUser(httpServer, { username: 'rt_kick_member' });
    const roomId = await createPublicRoom(httpServer, owner.accessToken, 'Kick Room');

    await request(httpServer)
      .post(`/api/rooms/${roomId}/join`)
      .set(bearerAuthorization(member.accessToken))
      .expect(201);

    const sender = await connectSocket(serverUrl, owner.accessToken);
    const kicked = await connectSocket(serverUrl, member.accessToken);

    try {
      await joinRoom(sender, roomId);
      await joinRoom(kicked, roomId);

      const leftPromise = onceRoomLeftEvent(kicked);
      await request(httpServer)
        .delete(`/api/rooms/${roomId}/members/${member.userId}`)
        .set(bearerAuthorization(owner.accessToken))
        .expect(204);

      await expect(leftPromise).resolves.toMatchObject({ roomId });

      let received = false;
      kicked.on(SERVER_SOCKET_EVENTS.MESSAGE_NEW, () => {
        received = true;
      });

      sender.emit(CLIENT_SOCKET_EVENTS.MESSAGE_SEND, {
        roomId,
        content: 'After kick',
        clientMessageId: 'client-kick-1',
      });

      await onceMessageNewEvent(sender);
      await delay(150);
      expect(received).toBe(false);
    } finally {
      sender.disconnect();
      kicked.disconnect();
      await waitForDisconnect(sender);
      await waitForDisconnect(kicked);
    }
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
  const joined = onceRoomJoinedEvent(socket);
  socket.emit(CLIENT_SOCKET_EVENTS.ROOM_JOIN, { roomId });
  await joined;
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

function onceMessageUpdatedEvent(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
): Promise<MessageUpdatedEvent> {
  return new Promise((resolve) => {
    socket.once(SERVER_SOCKET_EVENTS.MESSAGE_UPDATED, (payload: MessageUpdatedEvent) =>
      resolve(payload),
    );
  });
}

function onceMessageDeletedEvent(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
): Promise<MessageDeletedEvent> {
  return new Promise((resolve) => {
    socket.once(SERVER_SOCKET_EVENTS.MESSAGE_DELETED, (payload: MessageDeletedEvent) =>
      resolve(payload),
    );
  });
}

function onceRoomLeftEvent(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
): Promise<{ roomId: string }> {
  return new Promise((resolve) => {
    socket.once(SERVER_SOCKET_EVENTS.ROOM_LEFT, (payload) => resolve(payload));
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
