import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import {
  API_ERROR_CODES,
  MEMBERSHIP_ROLES,
  ROOM_ERROR_CODES,
  ROOM_TYPES,
} from '@pulse-chat/shared';

import { AppModule } from '../app.module.js';
import { configureApplication } from '../bootstrap/configure-application.js';
import { AppConfigService } from '../config/index.js';
import { RedisService } from '../infrastructure/redis/redis.service.js';
import { bearerAuthorization, registerTestUser } from '../test/auth-test.helpers.js';
import { startMongoMemoryServer, stopMongoMemoryServer } from '../test/mongo-memory.js';
import { TestRedisService } from '../test/test-redis.service.js';

function createdRoomId(body: unknown): string {
  return (body as { id: string }).id;
}

describe('RoomsController', () => {
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

  it('rejects unauthenticated room requests', async () => {
    const response = await request(httpServer).get('/api/rooms').expect(401);

    expect(response.body).toMatchObject({
      code: API_ERROR_CODES.UNAUTHORIZED,
    });
  });

  it('creates a public room and lists it for any authenticated user', async () => {
    const owner = await registerTestUser(httpServer, { username: 'room_owner_pub' });
    const outsider = await registerTestUser(httpServer, { username: 'room_outsider_pub' });

    const created = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Town Hall', description: 'Open discussion' })
      .expect(201);

    expect(created.body).toMatchObject({
      name: 'Town Hall',
      type: ROOM_TYPES.PUBLIC,
      ownerId: owner.userId,
      currentUserRole: MEMBERSHIP_ROLES.OWNER,
    });

    const listed = await request(httpServer)
      .get('/api/rooms')
      .set(bearerAuthorization(outsider.accessToken))
      .expect(200);

    expect(listed.body as { id: string }[]).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: createdRoomId(created.body) })]),
    );
  });

  it('hides private rooms from non-members and denies retrieval', async () => {
    const owner = await registerTestUser(httpServer, { username: 'private_owner' });
    const outsider = await registerTestUser(httpServer, { username: 'private_outsider' });

    const created = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PRIVATE, name: 'Leadership' })
      .expect(201);

    const listed = await request(httpServer)
      .get('/api/rooms')
      .set(bearerAuthorization(outsider.accessToken))
      .expect(200);

    expect(
      (listed.body as { id: string }[]).some((item) => item.id === createdRoomId(created.body)),
    ).toBe(false);

    const denied = await request(httpServer)
      .get(`/api/rooms/${createdRoomId(created.body)}`)
      .set(bearerAuthorization(outsider.accessToken))
      .expect(403);

    expect(denied.body).toMatchObject({
      code: ROOM_ERROR_CODES.ROOM_ACCESS_DENIED,
    });

    await request(httpServer)
      .post(`/api/rooms/${createdRoomId(created.body)}/join`)
      .set(bearerAuthorization(outsider.accessToken))
      .expect(403);
  });

  it('lets a member join a public room and then leave it', async () => {
    const owner = await registerTestUser(httpServer, { username: 'join_owner' });
    const joiner = await registerTestUser(httpServer, { username: 'join_user' });

    const created = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Joinable' })
      .expect(201);

    const joined = await request(httpServer)
      .post(`/api/rooms/${createdRoomId(created.body)}/join`)
      .set(bearerAuthorization(joiner.accessToken))
      .expect(201);

    expect(joined.body).toMatchObject({
      userId: joiner.userId,
      role: MEMBERSHIP_ROLES.MEMBER,
    });

    const roomId = createdRoomId(created.body);

    await request(httpServer)
      .post(`/api/rooms/${roomId}/leave`)
      .set(bearerAuthorization(joiner.accessToken))
      .expect(204);

    await request(httpServer)
      .get(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(joiner.accessToken))
      .expect(403);

    await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(joiner.accessToken))
      .send({ content: 'After leave', clientMessageId: 'after-leave' })
      .expect(403);

    await request(httpServer)
      .post(`/api/rooms/${roomId}/read`)
      .set(bearerAuthorization(joiner.accessToken))
      .send({ messageId: '507f1f77bcf86cd799439099' })
      .expect(403);
  });

  it('forbids a member from renaming, deleting, or managing members', async () => {
    const owner = await registerTestUser(httpServer, { username: 'perm_owner' });
    const member = await registerTestUser(httpServer, { username: 'perm_member' });

    const created = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Permissions' })
      .expect(201);

    await request(httpServer)
      .post(`/api/rooms/${createdRoomId(created.body)}/join`)
      .set(bearerAuthorization(member.accessToken))
      .expect(201);

    const rename = await request(httpServer)
      .patch(`/api/rooms/${createdRoomId(created.body)}`)
      .set(bearerAuthorization(member.accessToken))
      .send({ name: 'Hijacked' })
      .expect(403);

    expect(rename.body).toMatchObject({
      code: ROOM_ERROR_CODES.INSUFFICIENT_ROOM_ROLE,
    });

    await request(httpServer)
      .delete(`/api/rooms/${createdRoomId(created.body)}`)
      .set(bearerAuthorization(member.accessToken))
      .expect(403);

    await request(httpServer)
      .post(`/api/rooms/${createdRoomId(created.body)}/members`)
      .set(bearerAuthorization(member.accessToken))
      .send({ userId: owner.userId })
      .expect(403);
  });

  it('lets a moderator update settings and remove members but not delete the room', async () => {
    const owner = await registerTestUser(httpServer, { username: 'mod_owner' });
    const moderator = await registerTestUser(httpServer, { username: 'mod_user' });
    const target = await registerTestUser(httpServer, { username: 'mod_target' });

    const created = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PRIVATE, name: 'Moderated' })
      .expect(201);

    const roomId = createdRoomId(created.body);

    await request(httpServer)
      .post(`/api/rooms/${roomId}/members`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ userId: moderator.userId, role: MEMBERSHIP_ROLES.MODERATOR })
      .expect(201);

    await request(httpServer)
      .post(`/api/rooms/${roomId}/members`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ userId: target.userId })
      .expect(201);

    await request(httpServer)
      .patch(`/api/rooms/${roomId}`)
      .set(bearerAuthorization(moderator.accessToken))
      .send({ description: 'Updated by moderator' })
      .expect(200);

    await request(httpServer)
      .delete(`/api/rooms/${roomId}/members/${target.userId}`)
      .set(bearerAuthorization(moderator.accessToken))
      .expect(204);

    await request(httpServer)
      .delete(`/api/rooms/${roomId}`)
      .set(bearerAuthorization(moderator.accessToken))
      .expect(403);

    await request(httpServer)
      .patch(`/api/rooms/${roomId}`)
      .set(bearerAuthorization(moderator.accessToken))
      .send({ name: 'Renamed by moderator' })
      .expect(403);
  });

  it('lets the owner transfer ownership and then delete the room', async () => {
    const owner = await registerTestUser(httpServer, { username: 'xfer_owner' });
    const successor = await registerTestUser(httpServer, { username: 'xfer_next' });

    const created = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PRIVATE, name: 'Transfer' })
      .expect(201);

    const roomId = createdRoomId(created.body);

    await request(httpServer)
      .post(`/api/rooms/${roomId}/members`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ userId: successor.userId })
      .expect(201);

    const transferred = await request(httpServer)
      .patch(`/api/rooms/${roomId}`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ ownerId: successor.userId })
      .expect(200);

    expect(transferred.body).toMatchObject({
      ownerId: successor.userId,
      currentUserRole: MEMBERSHIP_ROLES.MODERATOR,
    });

    await request(httpServer)
      .delete(`/api/rooms/${roomId}`)
      .set(bearerAuthorization(successor.accessToken))
      .expect(204);
  });

  it('enforces direct-room constraints of exactly two users', async () => {
    const alice = await registerTestUser(httpServer, { username: 'dm_alice' });
    const bob = await registerTestUser(httpServer, { username: 'dm_bob' });
    const carol = await registerTestUser(httpServer, { username: 'dm_carol' });

    const created = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(alice.accessToken))
      .send({ type: ROOM_TYPES.DIRECT, peerUserId: bob.userId })
      .expect(201);

    expect(created.body).toMatchObject({
      type: ROOM_TYPES.DIRECT,
      currentUserRole: MEMBERSHIP_ROLES.MEMBER,
    });
    expect(created.body).not.toHaveProperty('ownerId');

    const roomId = createdRoomId(created.body);

    await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(bob.accessToken))
      .send({ type: ROOM_TYPES.DIRECT, peerUserId: alice.userId })
      .expect(409);

    await request(httpServer)
      .post(`/api/rooms/${roomId}/join`)
      .set(bearerAuthorization(carol.accessToken))
      .expect(403);

    await request(httpServer)
      .post(`/api/rooms/${roomId}/members`)
      .set(bearerAuthorization(alice.accessToken))
      .send({ userId: carol.userId })
      .expect(403);

    const members = await request(httpServer)
      .get(`/api/rooms/${roomId}/members`)
      .set(bearerAuthorization(alice.accessToken))
      .expect(200);

    expect(members.body).toHaveLength(2);

    await request(httpServer)
      .get(`/api/rooms/${roomId}`)
      .set(bearerAuthorization(carol.accessToken))
      .expect(403);
  });

  it('prevents the owner from leaving while other members remain', async () => {
    const owner = await registerTestUser(httpServer, { username: 'leave_owner' });
    const member = await registerTestUser(httpServer, { username: 'leave_member' });

    const created = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PRIVATE, name: 'Stay' })
      .expect(201);

    await request(httpServer)
      .post(`/api/rooms/${createdRoomId(created.body)}/members`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ userId: member.userId })
      .expect(201);

    const response = await request(httpServer)
      .post(`/api/rooms/${createdRoomId(created.body)}/leave`)
      .set(bearerAuthorization(owner.accessToken))
      .expect(409);

    expect(response.body).toMatchObject({
      code: ROOM_ERROR_CODES.OWNER_CANNOT_LEAVE,
    });
  });

  it('blocks an outsider from reading private room members', async () => {
    const owner = await registerTestUser(httpServer, { username: 'priv_mem_owner' });
    const outsider = await registerTestUser(httpServer, { username: 'priv_mem_out' });

    const created = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PRIVATE, name: 'Secret roster' })
      .expect(201);

    const response = await request(httpServer)
      .get(`/api/rooms/${createdRoomId(created.body)}/members`)
      .set(bearerAuthorization(outsider.accessToken))
      .expect(403);

    expect(response.body).toMatchObject({
      code: ROOM_ERROR_CODES.ROOM_ACCESS_DENIED,
    });
  });

  it('blocks an outsider from modifying or deleting a private room', async () => {
    const owner = await registerTestUser(httpServer, { username: 'priv_mut_owner' });
    const outsider = await registerTestUser(httpServer, { username: 'priv_mut_out' });

    const created = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PRIVATE, name: 'No touch' })
      .expect(201);

    const roomId = createdRoomId(created.body);

    await request(httpServer)
      .patch(`/api/rooms/${roomId}`)
      .set(bearerAuthorization(outsider.accessToken))
      .send({ name: 'Hijacked' })
      .expect(403);

    await request(httpServer)
      .delete(`/api/rooms/${roomId}`)
      .set(bearerAuthorization(outsider.accessToken))
      .expect(403);

    await request(httpServer)
      .get(`/api/rooms/${roomId}`)
      .set(bearerAuthorization(owner.accessToken))
      .expect(200);
  });

  it('blocks a member from removing another user or promoting anyone', async () => {
    const owner = await registerTestUser(httpServer, { username: 'rm_owner' });
    const member = await registerTestUser(httpServer, { username: 'rm_member' });
    const target = await registerTestUser(httpServer, { username: 'rm_target' });

    const created = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PRIVATE, name: 'No promotions' })
      .expect(201);

    const roomId = createdRoomId(created.body);

    await request(httpServer)
      .post(`/api/rooms/${roomId}/members`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ userId: member.userId })
      .expect(201);

    await request(httpServer)
      .post(`/api/rooms/${roomId}/members`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ userId: target.userId })
      .expect(201);

    await request(httpServer)
      .delete(`/api/rooms/${roomId}/members/${target.userId}`)
      .set(bearerAuthorization(member.accessToken))
      .expect(403);

    await request(httpServer)
      .post(`/api/rooms/${roomId}/members`)
      .set(bearerAuthorization(member.accessToken))
      .send({ userId: member.userId, role: MEMBERSHIP_ROLES.MODERATOR })
      .expect(403);

    await request(httpServer)
      .patch(`/api/rooms/${roomId}`)
      .set(bearerAuthorization(member.accessToken))
      .send({ ownerId: member.userId })
      .expect(403);
  });

  it('blocks a moderator from promoting another user to moderator', async () => {
    const owner = await registerTestUser(httpServer, { username: 'modprom_owner' });
    const moderator = await registerTestUser(httpServer, { username: 'modprom_mod' });
    const recruit = await registerTestUser(httpServer, { username: 'modprom_new' });

    const created = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PRIVATE, name: 'No lateral promo' })
      .expect(201);

    const roomId = createdRoomId(created.body);

    await request(httpServer)
      .post(`/api/rooms/${roomId}/members`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ userId: moderator.userId, role: MEMBERSHIP_ROLES.MODERATOR })
      .expect(201);

    const response = await request(httpServer)
      .post(`/api/rooms/${roomId}/members`)
      .set(bearerAuthorization(moderator.accessToken))
      .send({ userId: recruit.userId, role: MEMBERSHIP_ROLES.MODERATOR })
      .expect(403);

    expect(response.body).toMatchObject({
      code: ROOM_ERROR_CODES.INSUFFICIENT_ROOM_ROLE,
    });
  });

  it('rejects manipulated room identifiers and extra authorization fields', async () => {
    const owner = await registerTestUser(httpServer, { username: 'id_owner' });

    await request(httpServer)
      .get('/api/rooms/not-a-valid-object-id')
      .set(bearerAuthorization(owner.accessToken))
      .expect(404);

    await request(httpServer)
      .get(`/api/rooms/${owner.userId}`)
      .set(bearerAuthorization(owner.accessToken))
      .expect(404);

    await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PRIVATE, name: 'Inject', ownerId: owner.userId })
      .expect(400);

    const created = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PRIVATE, name: 'Typed' })
      .expect(201);

    await request(httpServer)
      .patch(`/api/rooms/${createdRoomId(created.body)}`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Now public' })
      .expect(400);

    await request(httpServer)
      .post(`/api/rooms/${createdRoomId(created.body)}/members`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ userId: owner.userId, role: MEMBERSHIP_ROLES.OWNER })
      .expect(400);
  });

  it('blocks outsiders from accessing or dissolving a direct conversation', async () => {
    const alice = await registerTestUser(httpServer, { username: 'adv_dm_a' });
    const bob = await registerTestUser(httpServer, { username: 'adv_dm_b' });
    const eve = await registerTestUser(httpServer, { username: 'adv_dm_e' });

    const created = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(alice.accessToken))
      .send({ type: ROOM_TYPES.DIRECT, peerUserId: bob.userId })
      .expect(201);

    const roomId = createdRoomId(created.body);

    await request(httpServer)
      .get(`/api/rooms/${roomId}/members`)
      .set(bearerAuthorization(eve.accessToken))
      .expect(403);

    await request(httpServer)
      .post(`/api/rooms/${roomId}/leave`)
      .set(bearerAuthorization(eve.accessToken))
      .expect(403);

    await request(httpServer)
      .delete(`/api/rooms/${roomId}`)
      .set(bearerAuthorization(eve.accessToken))
      .expect(403);

    await request(httpServer)
      .get(`/api/rooms/${roomId}`)
      .set(bearerAuthorization(alice.accessToken))
      .expect(200);
  });

  it('updates read state when a member marks a room as read', async () => {
    const owner = await registerTestUser(httpServer, { username: 'read_owner' });

    const created = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Read markers' })
      .expect(201);

    const roomId = createdRoomId(created.body);

    const first = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ content: 'First', clientMessageId: 'read-msg-1' })
      .expect(201);

    const second = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ content: 'Second', clientMessageId: 'read-msg-2' })
      .expect(201);

    const readResponse = await request(httpServer)
      .post(`/api/rooms/${roomId}/read`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ messageId: (second.body as { id: string }).id })
      .expect(201);

    expect(readResponse.body).toMatchObject({
      roomId,
      userId: owner.userId,
      lastReadMessageId: (second.body as { id: string }).id,
    });

    const listed = await request(httpServer)
      .get('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .expect(200);

    const listedRoom = (listed.body as { id: string; lastReadMessageId?: string }[]).find(
      (entry) => entry.id === roomId,
    );

    expect(listedRoom?.lastReadMessageId).toBe((second.body as { id: string }).id);
    expect((first.body as { id: string }).id).not.toBe((second.body as { id: string }).id);
  });

  it('forbids outsiders from marking a private room as read', async () => {
    const owner = await registerTestUser(httpServer, { username: 'read_priv_owner' });
    const outsider = await registerTestUser(httpServer, { username: 'read_priv_out' });

    const created = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PRIVATE, name: 'Private read' })
      .expect(201);
    const roomId = createdRoomId(created.body);

    const message = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ content: 'Secret', clientMessageId: 'read-priv-1' })
      .expect(201);

    const denied = await request(httpServer)
      .post(`/api/rooms/${roomId}/read`)
      .set(bearerAuthorization(outsider.accessToken))
      .send({ messageId: (message.body as { id: string }).id })
      .expect(403);

    expect(denied.body).toMatchObject({ code: ROOM_ERROR_CODES.ROOM_ACCESS_DENIED });
  });

  it('rejects a read cursor from another room', async () => {
    const owner = await registerTestUser(httpServer, { username: 'read_cross_owner' });

    const firstRoom = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Read A' })
      .expect(201);
    const secondRoom = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(owner.accessToken))
      .send({ type: ROOM_TYPES.PUBLIC, name: 'Read B' })
      .expect(201);

    const foreign = await request(httpServer)
      .post(`/api/rooms/${createdRoomId(secondRoom.body)}/messages`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ content: 'Other room', clientMessageId: 'read-cross-1' })
      .expect(201);

    const denied = await request(httpServer)
      .post(`/api/rooms/${createdRoomId(firstRoom.body)}/read`)
      .set(bearerAuthorization(owner.accessToken))
      .send({ messageId: (foreign.body as { id: string }).id })
      .expect(400);

    expect(denied.body).toMatchObject({ code: ROOM_ERROR_CODES.INVALID_ROOM_OPERATION });
  });
});
