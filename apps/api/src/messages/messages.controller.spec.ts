import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import {
  API_ERROR_CODES,
  MEMBERSHIP_ROLES,
  MESSAGE_ERROR_CODES,
  MESSAGE_MAX_LENGTH,
  ROOM_ERROR_CODES,
  ROOM_TYPES,
  type MessageListResponse,
  type MessageResponse,
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

describe('MessagesController', () => {
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

  it('rejects unauthenticated message requests', async () => {
    const response = await request(httpServer)
      .get('/api/rooms/507f1f77bcf86cd799439021/messages')
      .expect(401);

    expect(response.body).toMatchObject({
      code: API_ERROR_CODES.UNAUTHORIZED,
    });
  });

  it('lets a room member create a message and read it from history', async () => {
    const owner = await registerTestUser(httpServer, { username: 'msg_owner' });

    const room = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Chat' })
      .expect(201);

    const roomId = createdId(room.body);

    const created = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ content: '  Hello room  ', clientMessageId: 'client-hello' })
      .expect(201);

    const body = created.body as MessageResponse;
    expect(body).toMatchObject({
      roomId,
      authorId: owner.userId,
      content: 'Hello room',
      clientMessageId: 'client-hello',
      attachments: [],
    });
    expect(body).not.toHaveProperty('passwordHash');
    expect(typeof body.createdAt).toBe('string');

    const history = await request(httpServer)
      .get(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .expect(200);

    const list = history.body as MessageListResponse;
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.id).toBe(body.id);
    expect(list.nextCursor).toBeUndefined();
  });

  it('returns the original message when the same clientMessageId is retried', async () => {
    const owner = await registerTestUser(httpServer, { username: 'msg_idem' });

    const room = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Idempotent' })
      .expect(201);

    const roomId = createdId(room.body);
    const payload = { content: 'Once', clientMessageId: 'retry-me' };

    const first = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .send(payload)
      .expect(201);

    const second = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ ...payload, content: 'Once more' })
      .expect(201);

    expect((second.body as MessageResponse).id).toBe((first.body as MessageResponse).id);
    expect((second.body as MessageResponse).content).toBe('Once');

    const history = await request(httpServer)
      .get(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .expect(200);

    expect((history.body as MessageListResponse).items).toHaveLength(1);
  });

  it('keeps idempotent retries stable even when the retried payload includes an invalid reply target', async () => {
    const owner = await registerTestUser(httpServer, { username: 'msg_idem_reply' });

    const room = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Idempotent replies' })
      .expect(201);
    const roomId = createdId(room.body);

    const first = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ content: 'Stable', clientMessageId: 'stable-retry' })
      .expect(201);

    const second = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .send({
        content: 'Changed',
        clientMessageId: 'stable-retry',
        replyToMessageId: '507f1f77bcf86cd799439099',
      })
      .expect(201);

    expect((second.body as MessageResponse).id).toBe((first.body as MessageResponse).id);
    expect((second.body as MessageResponse).content).toBe('Stable');
  });

  it('allows two members to reuse the same clientMessageId independently', async () => {
    const owner = await registerTestUser(httpServer, { username: 'msg_share_a' });
    const member = await registerTestUser(httpServer, { username: 'msg_share_b' });

    const room = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Shared ids' })
      .expect(201);

    const roomId = createdId(room.body);

    await request(httpServer)
      .post(`/api/rooms/${roomId}/join`)
      .set(bearerAuthorization(member.accessToken))
      .expect(201);

    const first = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ content: 'From owner', clientMessageId: 'same-client-id' })
      .expect(201);

    const second = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(member.accessToken))
      .send({ content: 'From member', clientMessageId: 'same-client-id' })
      .expect(201);

    expect((first.body as MessageResponse).id).not.toBe((second.body as MessageResponse).id);

    const history = await request(httpServer)
      .get(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .expect(200);

    expect((history.body as MessageListResponse).items).toHaveLength(2);
  });

  it('forbids non-members from reading or writing messages in a public room', async () => {
    const owner = await registerTestUser(httpServer, { username: 'msg_pub_owner' });
    const lurker = await registerTestUser(httpServer, { username: 'msg_pub_lurk' });

    const room = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Town square' })
      .expect(201);

    const roomId = createdId(room.body);

    const write = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(lurker.accessToken))
      .send({ content: 'Sneaky', clientMessageId: 'sneak-1' })
      .expect(403);

    expect(write.body).toMatchObject({ code: ROOM_ERROR_CODES.NOT_A_MEMBER });

    const read = await request(httpServer)
      .get(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(lurker.accessToken))
      .expect(403);

    expect(read.body).toMatchObject({ code: ROOM_ERROR_CODES.NOT_A_MEMBER });
  });

  it('denies outsiders of a private room', async () => {
    const owner = await registerTestUser(httpServer, { username: 'msg_priv_owner' });
    const outsider = await registerTestUser(httpServer, { username: 'msg_priv_out' });

    const room = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PRIVATE, name: 'Secret' })
      .expect(201);

    const roomId = createdId(room.body);

    const write = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(outsider.accessToken))
      .send({ content: 'Hello', clientMessageId: 'out-1' })
      .expect(403);

    expect(write.body).toMatchObject({ code: ROOM_ERROR_CODES.ROOM_ACCESS_DENIED });
  });

  it('rejects empty, whitespace-only, and oversized messages', async () => {
    const owner = await registerTestUser(httpServer, { username: 'msg_valid' });

    const room = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Validation' })
      .expect(201);

    const roomId = createdId(room.body);
    const headers = bearerAuthorization(owner.accessToken);

    const empty = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(headers)
      .send({ content: '', clientMessageId: 'empty' })
      .expect(400);
    expect(empty.body).toMatchObject({ code: API_ERROR_CODES.VALIDATION_FAILED });

    const whitespace = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(headers)
      .send({ content: '   \n  ', clientMessageId: 'ws' })
      .expect(400);
    expect(whitespace.body).toMatchObject({ code: API_ERROR_CODES.VALIDATION_FAILED });

    const oversized = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(headers)
      .send({ content: 'a'.repeat(MESSAGE_MAX_LENGTH + 1), clientMessageId: 'big' })
      .expect(400);
    expect(oversized.body).toMatchObject({ code: API_ERROR_CODES.VALIDATION_FAILED });

    const missingClientId = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(headers)
      .send({ content: 'Hello' })
      .expect(400);
    expect(missingClientId.body).toMatchObject({ code: API_ERROR_CODES.VALIDATION_FAILED });
  });

  it('pages history with a before cursor and never returns more than the requested limit', async () => {
    const owner = await registerTestUser(httpServer, { username: 'msg_page' });

    const room = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Paging' })
      .expect(201);

    const roomId = createdId(room.body);
    const headers = bearerAuthorization(owner.accessToken);
    const ids: string[] = [];

    for (let index = 0; index < 3; index += 1) {
      const created = await request(httpServer)
        .post(`/api/rooms/${roomId}/messages`)
        .set(headers)
        .send({ content: `msg-${String(index)}`, clientMessageId: `page-${String(index)}` })
        .expect(201);
      ids.push((created.body as MessageResponse).id);
    }

    const firstPage = await request(httpServer)
      .get(`/api/rooms/${roomId}/messages`)
      .query({ limit: 2 })
      .set(headers)
      .expect(200);

    const first = firstPage.body as MessageListResponse;
    expect(first.items).toHaveLength(2);
    expect(first.items.map((item) => item.id)).toEqual([ids[2], ids[1]]);
    expect(first.nextCursor).toBe(ids[1]);

    const secondPage = await request(httpServer)
      .get(`/api/rooms/${roomId}/messages`)
      .query({ limit: 2, before: first.nextCursor })
      .set(headers)
      .expect(200);

    const second = secondPage.body as MessageListResponse;
    expect(second.items).toHaveLength(1);
    expect(second.items[0]?.id).toBe(ids[0]);
    expect(second.nextCursor).toBeUndefined();
  });

  it('rejects a page size above the maximum', async () => {
    const owner = await registerTestUser(httpServer, { username: 'msg_limit' });

    const room = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Limits' })
      .expect(201);

    const response = await request(httpServer)
      .get(`/api/rooms/${createdId(room.body)}/messages`)
      .query({ limit: 101 })
      .set(bearerAuthorization(owner.accessToken))
      .expect(400);

    expect(response.body).toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
    });
  });

  it('rejects an unknown pagination cursor', async () => {
    const owner = await registerTestUser(httpServer, { username: 'msg_cursor' });

    const room = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Cursor' })
      .expect(201);

    const roomId = createdId(room.body);

    const response = await request(httpServer)
      .get(`/api/rooms/${roomId}/messages`)
      .query({ before: '507f1f77bcf86cd799439099' })
      .set(bearerAuthorization(owner.accessToken))
      .expect(400);

    expect(response.body).toMatchObject({
      code: MESSAGE_ERROR_CODES.INVALID_MESSAGE_CURSOR,
    });
  });

  it('returns 404 for an unknown room', async () => {
    const owner = await registerTestUser(httpServer, { username: 'msg_missing' });

    const response = await request(httpServer)
      .get('/api/rooms/507f1f77bcf86cd799439099/messages')
      .set(bearerAuthorization(owner.accessToken))
      .expect(404);

    expect(response.body).toMatchObject({
      code: ROOM_ERROR_CODES.ROOM_NOT_FOUND,
    });
  });

  it('lets the author edit their own message and records editedAt', async () => {
    const owner = await registerTestUser(httpServer, { username: 'ed_owner' });
    const room = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Edit own' })
      .expect(201);
    const roomId = createdId(room.body);

    const created = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ content: 'Original', clientMessageId: 'edit-own' })
      .expect(201);

    const edited = await request(httpServer)
      .patch(`/api/messages/${createdId(created.body)}`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ content: '  Corrected  ' })
      .expect(200);

    const body = edited.body as MessageResponse;
    expect(body).toMatchObject({
      id: createdId(created.body),
      content: 'Corrected',
      authorId: owner.userId,
    });
    expect(typeof body.editedAt).toBe('string');
    expect(body.deletedAt).toBeUndefined();
  });

  it('lets the author soft-delete their own message without exposing content', async () => {
    const owner = await registerTestUser(httpServer, { username: 'del_owner' });
    const room = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Delete own' })
      .expect(201);
    const roomId = createdId(room.body);

    const created = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ content: 'Remove me', clientMessageId: 'del-own' })
      .expect(201);

    await request(httpServer)
      .delete(`/api/messages/${createdId(created.body)}`)
      .set(bearerAuthorization(owner.accessToken))
      .expect(204);

    const history = await request(httpServer)
      .get(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .expect(200);

    const listed = (history.body as MessageListResponse).items[0];
    expect(listed).toMatchObject({
      id: createdId(created.body),
      content: '',
      authorId: owner.userId,
    });
    expect(typeof listed?.deletedAt).toBe('string');
    expect(listed?.content).not.toContain('Remove me');
  });

  it('lets a moderator edit and delete another member\'s message', async () => {
    const owner = await registerTestUser(httpServer, { username: 'mod_msg_own' });
    const moderator = await registerTestUser(httpServer, { username: 'mod_msg_mod' });
    const member = await registerTestUser(httpServer, { username: 'mod_msg_mem' });

    const room = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PRIVATE, name: 'Moderated chat' })
      .expect(201);
    const roomId = createdId(room.body);

    await request(httpServer)
      .post(`/api/rooms/${roomId}/members`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ userId: moderator.userId, role: MEMBERSHIP_ROLES.MODERATOR })
      .expect(201);

    await request(httpServer)
      .post(`/api/rooms/${roomId}/members`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ userId: member.userId })
      .expect(201);

    const created = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(member.accessToken))
      .send({ content: 'Please review', clientMessageId: 'mod-target' })
      .expect(201);
    const messageId = createdId(created.body);

    const edited = await request(httpServer)
      .patch(`/api/messages/${messageId}`)
      .set(bearerAuthorization(moderator.accessToken))
      .send({ content: 'Reviewed' })
      .expect(200);

    expect((edited.body as MessageResponse).content).toBe('Reviewed');
    expect((edited.body as MessageResponse).authorId).toBe(member.userId);

    await request(httpServer)
      .delete(`/api/messages/${messageId}`)
      .set(bearerAuthorization(moderator.accessToken))
      .expect(204);

    const history = await request(httpServer)
      .get(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .expect(200);

    expect((history.body as MessageListResponse).items[0]).toMatchObject({
      id: messageId,
      content: '',
    });
  });

  it('forbids a member from editing or deleting someone else\'s message', async () => {
    const owner = await registerTestUser(httpServer, { username: 'unauth_own' });
    const member = await registerTestUser(httpServer, { username: 'unauth_mem' });

    const room = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Unauthorized' })
      .expect(201);
    const roomId = createdId(room.body);

    await request(httpServer)
      .post(`/api/rooms/${roomId}/join`)
      .set(bearerAuthorization(member.accessToken))
      .expect(201);

    const created = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ content: 'Owner only', clientMessageId: 'unauth-1' })
      .expect(201);
    const messageId = createdId(created.body);

    const edit = await request(httpServer)
      .patch(`/api/messages/${messageId}`)
      .set(bearerAuthorization(member.accessToken))
      .send({ content: 'Hijack' })
      .expect(403);

    expect(edit.body).toMatchObject({ code: ROOM_ERROR_CODES.INSUFFICIENT_ROOM_ROLE });

    const remove = await request(httpServer)
      .delete(`/api/messages/${messageId}`)
      .set(bearerAuthorization(member.accessToken))
      .expect(403);

    expect(remove.body).toMatchObject({ code: ROOM_ERROR_CODES.INSUFFICIENT_ROOM_ROLE });
  });

  it('rejects editing a deleted message', async () => {
    const owner = await registerTestUser(httpServer, { username: 'edit_del' });
    const room = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Edit deleted' })
      .expect(201);
    const roomId = createdId(room.body);

    const created = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ content: 'Soon gone', clientMessageId: 'edit-del' })
      .expect(201);
    const messageId = createdId(created.body);

    await request(httpServer)
      .delete(`/api/messages/${messageId}`)
      .set(bearerAuthorization(owner.accessToken))
      .expect(204);

    const response = await request(httpServer)
      .patch(`/api/messages/${messageId}`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ content: 'Revive' })
      .expect(409);

    expect(response.body).toMatchObject({
      code: MESSAGE_ERROR_CODES.MESSAGE_ALREADY_DELETED,
    });
  });

  it('rejects deleting a message that is already deleted', async () => {
    const owner = await registerTestUser(httpServer, { username: 'del_twice' });
    const room = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Delete twice' })
      .expect(201);
    const roomId = createdId(room.body);

    const created = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ content: 'Once', clientMessageId: 'del-twice' })
      .expect(201);
    const messageId = createdId(created.body);

    await request(httpServer)
      .delete(`/api/messages/${messageId}`)
      .set(bearerAuthorization(owner.accessToken))
      .expect(204);

    const response = await request(httpServer)
      .delete(`/api/messages/${messageId}`)
      .set(bearerAuthorization(owner.accessToken))
      .expect(409);

    expect(response.body).toMatchObject({
      code: MESSAGE_ERROR_CODES.MESSAGE_ALREADY_DELETED,
    });
  });

  it('rejects unauthenticated edit and delete requests', async () => {
    await request(httpServer)
      .patch('/api/messages/507f1f77bcf86cd799439041')
      .send({ content: 'Nope' })
      .expect(401);

    await request(httpServer).delete('/api/messages/507f1f77bcf86cd799439041').expect(401);
  });

  it('adds reactions and exposes the aggregated state on the message dto', async () => {
    const owner = await registerTestUser(httpServer, { username: 'react_add_owner' });
    const member = await registerTestUser(httpServer, { username: 'react_add_member' });

    const room = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Reactions' })
      .expect(201);
    const roomId = createdId(room.body);

    await request(httpServer)
      .post(`/api/rooms/${roomId}/join`)
      .set(bearerAuthorization(member.accessToken))
      .expect(201);

    const created = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ content: 'React here', clientMessageId: 'react-add' })
      .expect(201);
    const messageId = createdId(created.body);

    await request(httpServer)
      .post(`/api/messages/${messageId}/reactions`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ emoji: '👍' })
      .expect(201);

    const second = await request(httpServer)
      .post(`/api/messages/${messageId}/reactions`)
      .set(bearerAuthorization(member.accessToken))
      .send({ emoji: '👍' })
      .expect(201);

    expect((second.body as MessageResponse).reactions).toEqual([
      { emoji: '👍', count: 2, reactedByCurrentUser: true },
    ]);
  });

  it('removes reactions through both toggle and delete endpoints', async () => {
    const owner = await registerTestUser(httpServer, { username: 'react_remove_owner' });

    const room = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Reaction removal' })
      .expect(201);
    const roomId = createdId(room.body);

    const created = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ content: 'Toggle me', clientMessageId: 'react-remove' })
      .expect(201);
    const messageId = createdId(created.body);

    await request(httpServer)
      .post(`/api/messages/${messageId}/reactions`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ emoji: '🔥' })
      .expect(201);

    const toggledOff = await request(httpServer)
      .post(`/api/messages/${messageId}/reactions`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ emoji: '🔥' })
      .expect(201);
    expect((toggledOff.body as MessageResponse).reactions).toEqual([]);

    await request(httpServer)
      .post(`/api/messages/${messageId}/reactions`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ emoji: '🔥' })
      .expect(201);

    const removed = await request(httpServer)
      .delete(`/api/messages/${messageId}/reactions/${encodeURIComponent('🔥')}`)
      .set(bearerAuthorization(owner.accessToken))
      .expect(200);
    expect((removed.body as MessageResponse).reactions).toEqual([]);
  });

  it('prevents unauthorized users from reacting to messages', async () => {
    const owner = await registerTestUser(httpServer, { username: 'react_auth_owner' });
    const outsider = await registerTestUser(httpServer, { username: 'react_auth_out' });

    const room = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PRIVATE, name: 'Restricted reactions' })
      .expect(201);
    const roomId = createdId(room.body);

    const created = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ content: 'Restricted', clientMessageId: 'react-auth' })
      .expect(201);
    const messageId = createdId(created.body);

    const response = await request(httpServer)
      .post(`/api/messages/${messageId}/reactions`)
      .set(bearerAuthorization(outsider.accessToken))
      .send({ emoji: '👍' })
      .expect(403);

    expect(response.body).toMatchObject({ code: ROOM_ERROR_CODES.ROOM_ACCESS_DENIED });
  });

  it('rejects reactions on deleted messages', async () => {
    const owner = await registerTestUser(httpServer, { username: 'react_deleted_owner' });

    const room = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Deleted reactions' })
      .expect(201);
    const roomId = createdId(room.body);

    const created = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ content: 'Gone', clientMessageId: 'react-deleted' })
      .expect(201);
    const messageId = createdId(created.body);

    await request(httpServer)
      .delete(`/api/messages/${messageId}`)
      .set(bearerAuthorization(owner.accessToken))
      .expect(204);

    const response = await request(httpServer)
      .post(`/api/messages/${messageId}/reactions`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ emoji: '👍' })
      .expect(409);

    expect(response.body).toMatchObject({ code: MESSAGE_ERROR_CODES.MESSAGE_ALREADY_DELETED });
  });

  it('accepts a valid reply and exposes reply metadata on the created message', async () => {
    const owner = await registerTestUser(httpServer, { username: 'reply_valid_owner' });

    const room = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Replies' })
      .expect(201);
    const roomId = createdId(room.body);

    const original = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ content: 'Original message', clientMessageId: 'reply-origin' })
      .expect(201);

    const reply = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .send({
        content: 'My reply',
        clientMessageId: 'reply-child',
        replyToMessageId: createdId(original.body),
      })
      .expect(201);

    expect((reply.body as MessageResponse)).toMatchObject({
      replyToMessageId: createdId(original.body),
      replyTo: {
        id: createdId(original.body),
        authorId: owner.userId,
        content: 'Original message',
      },
    });
  });

  it('rejects invalid reply references', async () => {
    const owner = await registerTestUser(httpServer, { username: 'reply_invalid_owner' });

    const room = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Invalid reply' })
      .expect(201);
    const roomId = createdId(room.body);

    const response = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .send({
        content: 'Broken reply',
        clientMessageId: 'reply-invalid',
        replyToMessageId: '507f1f77bcf86cd799439099',
      })
      .expect(400);

    expect(response.body).toMatchObject({ code: MESSAGE_ERROR_CODES.INVALID_REPLY_REFERENCE });
  });

  it('rejects reply references that point to another inaccessible room', async () => {
    const owner = await registerTestUser(httpServer, { username: 'reply_cross_owner' });
    const outsider = await registerTestUser(httpServer, { username: 'reply_cross_out' });

    const privateRoom = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PRIVATE, name: 'Secret source' })
      .expect(201);
    const privateRoomId = createdId(privateRoom.body);

    const privateMessage = await request(httpServer)
      .post(`/api/rooms/${privateRoomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ content: 'Hidden message', clientMessageId: 'reply-cross-origin' })
      .expect(201);

    const publicRoom = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(outsider.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Visible target' })
      .expect(201);
    const publicRoomId = createdId(publicRoom.body);

    const response = await request(httpServer)
      .post(`/api/rooms/${publicRoomId}/messages`)
      .set(bearerAuthorization(outsider.accessToken))
      .send({
        content: 'Cross-room reply',
        clientMessageId: 'reply-cross',
        replyToMessageId: createdId(privateMessage.body),
      })
      .expect(400);

    expect(response.body).toMatchObject({ code: MESSAGE_ERROR_CODES.INVALID_REPLY_REFERENCE });
  });
});
