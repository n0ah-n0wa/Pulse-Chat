import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { mkdtemp, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import {
  API_ERROR_CODES,
  ATTACHMENT_ERROR_CODES,
  ATTACHMENT_MAX_BYTES,
  ROOM_ERROR_CODES,
  ROOM_TYPES,
  type AttachmentResponse,
  type MessageResponse,
} from '@pulse-chat/shared';

import { AppModule } from '../app.module.js';
import { configureApplication } from '../bootstrap/configure-application.js';
import { AppConfigService } from '../config/index.js';
import { RedisService } from '../infrastructure/redis/redis.service.js';
import { bearerAuthorization, registerTestUser } from '../test/auth-test.helpers.js';
import { startMongoMemoryServer, stopMongoMemoryServer } from '../test/mongo-memory.js';
import { TestRedisService } from '../test/test-redis.service.js';

const PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const JPEG_BUFFER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const EXECUTABLE_BUFFER = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);

function createdId(body: unknown): string {
  return (body as { id: string }).id;
}

describe('Message attachments integration', () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  let httpServer: Server;
  let storageDir: string;

  beforeAll(async () => {
    storageDir = await mkdtemp(path.join(os.tmpdir(), 'pulse-attachment-tests-'));
    process.env['MONGODB_URI'] = await startMongoMemoryServer();
    process.env['FILE_STORAGE_PROVIDER'] = 'local';
    process.env['FILE_STORAGE_PATH'] = storageDir;

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

  async function createRoom(token: string, name: string): Promise<string> {
    const room = await request(httpServer)
      .post('/api/rooms')
      .set(bearerAuthorization(token))
      .send({ type: ROOM_TYPES.PUBLIC, name })
      .expect(201);

    return createdId(room.body);
  }

  it('uploads an attachment and attaches it to a message', async () => {
    const member = await registerTestUser(httpServer, { username: 'attach_ok' });
    const roomId = await createRoom(member.accessToken, 'Attachments');

    const uploaded = await request(httpServer)
      .post(`/api/rooms/${roomId}/attachments`)
      .set(bearerAuthorization(member.accessToken))
      .attach('file', PNG_BUFFER, 'screenshot.png')
      .expect(201);

    const attachment = uploaded.body as AttachmentResponse;
    expect(attachment).toMatchObject({
      filename: 'screenshot.png',
      mimeType: 'image/png',
      sizeBytes: PNG_BUFFER.byteLength,
    });
    expect(attachment.url).toContain('/api/files/');

    const created = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(member.accessToken))
      .send({
        content: 'See attached screenshot',
        clientMessageId: 'msg-with-attachment',
        attachmentIds: [attachment.id],
      })
      .expect(201);

    const message = created.body as MessageResponse;
    expect(message.attachments).toHaveLength(1);
    expect(message.attachments[0]?.id).toBe(attachment.id);
    expect(message.attachments[0]?.mimeType).toBe('image/png');
  });

  it('rejects invalid file types', async () => {
    const member = await registerTestUser(httpServer, { username: 'attach_type' });
    const roomId = await createRoom(member.accessToken, 'Invalid type');

    const response = await request(httpServer)
      .post(`/api/rooms/${roomId}/attachments`)
      .set(bearerAuthorization(member.accessToken))
      .attach('file', EXECUTABLE_BUFFER, 'program.exe')
      .expect(400);

    expect(response.body).toMatchObject({ code: ATTACHMENT_ERROR_CODES.INVALID_FILE_TYPE });
  });

  it('rejects oversized files', async () => {
    const member = await registerTestUser(httpServer, { username: 'attach_size' });
    const roomId = await createRoom(member.accessToken, 'Oversized');

    const oversized = Buffer.alloc(ATTACHMENT_MAX_BYTES + 1, 0x00);

    const response = await request(httpServer)
      .post(`/api/rooms/${roomId}/attachments`)
      .set(bearerAuthorization(member.accessToken))
      .attach('file', oversized, 'big.bin')
      .expect(400);

    expect(response.body).toMatchObject({ code: ATTACHMENT_ERROR_CODES.FILE_TOO_LARGE });
  });

  it('rejects uploads from users who are not room members', async () => {
    const owner = await registerTestUser(httpServer, { username: 'attach_owner' });
    const outsider = await registerTestUser(httpServer, { username: 'attach_outsider' });
    const roomId = await createRoom(owner.accessToken, 'Members only');

    const response = await request(httpServer)
      .post(`/api/rooms/${roomId}/attachments`)
      .set(bearerAuthorization(outsider.accessToken))
      .attach('file', PNG_BUFFER, 'blocked.png')
      .expect(403);

    expect(response.body).toMatchObject({ code: ROOM_ERROR_CODES.NOT_A_MEMBER });
  });

  it('lets the uploader delete an unlinked attachment', async () => {
    const member = await registerTestUser(httpServer, { username: 'attach_delete' });
    const roomId = await createRoom(member.accessToken, 'Delete attachment');

    const uploaded = await request(httpServer)
      .post(`/api/rooms/${roomId}/attachments`)
      .set(bearerAuthorization(member.accessToken))
      .attach('file', JPEG_BUFFER, 'draft.jpg')
      .expect(201);

    const attachmentId = (uploaded.body as AttachmentResponse).id;

    await request(httpServer)
      .delete(`/api/attachments/${attachmentId}`)
      .set(bearerAuthorization(member.accessToken))
      .expect(204);

    await request(httpServer)
      .delete(`/api/attachments/${attachmentId}`)
      .set(bearerAuthorization(member.accessToken))
      .expect(404);
  });

  it('creates a message with multiple attachments', async () => {
    const member = await registerTestUser(httpServer, { username: 'attach_multi' });
    const roomId = await createRoom(member.accessToken, 'Multiple attachments');

    const first = await request(httpServer)
      .post(`/api/rooms/${roomId}/attachments`)
      .set(bearerAuthorization(member.accessToken))
      .attach('file', PNG_BUFFER, 'one.png')
      .expect(201);

    const second = await request(httpServer)
      .post(`/api/rooms/${roomId}/attachments`)
      .set(bearerAuthorization(member.accessToken))
      .attach('file', JPEG_BUFFER, 'two.jpg')
      .expect(201);

    const firstId = (first.body as AttachmentResponse).id;
    const secondId = (second.body as AttachmentResponse).id;

    const created = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(member.accessToken))
      .send({
        content: 'Two files attached',
        clientMessageId: 'msg-multi-attach',
        attachmentIds: [firstId, secondId],
      })
      .expect(201);

    const message = created.body as MessageResponse;
    expect(message.attachments).toHaveLength(2);
    expect(message.attachments.map((item) => item.id).sort()).toEqual([firstId, secondId].sort());

    const history = await request(httpServer)
      .get(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(member.accessToken))
      .expect(200);

    const items = (history.body as { items: MessageResponse[] }).items;
    expect(items[0]?.attachments).toHaveLength(2);
  });

  it('refuses file downloads to users who are not room members', async () => {
    const member = await registerTestUser(httpServer, { username: 'attach_dl_member' });
    const outsider = await registerTestUser(httpServer, { username: 'attach_dl_out' });
    const roomId = await createRoom(member.accessToken, 'Private download');

    const uploaded = await request(httpServer)
      .post(`/api/rooms/${roomId}/attachments`)
      .set(bearerAuthorization(member.accessToken))
      .attach('file', PNG_BUFFER, 'secret.png')
      .expect(201);

    const attachment = uploaded.body as AttachmentResponse;
    const key = attachment.url.split('/').at(-1);
    expect(key).toEqual(expect.any(String));

    const denied = await request(httpServer)
      .get(`/api/files/${key ?? ''}`)
      .set(bearerAuthorization(outsider.accessToken))
      .expect(403);

    expect(denied.body).toMatchObject({ code: ROOM_ERROR_CODES.NOT_A_MEMBER });

    const invalid = await request(httpServer)
      .get(`/api/files/${encodeURIComponent('../secret.png')}`)
      .set(bearerAuthorization(member.accessToken))
      .expect(400);

    expect(invalid.body).toMatchObject({ code: ATTACHMENT_ERROR_CODES.INVALID_STORAGE_KEY });

    const allowed = await request(httpServer)
      .get(`/api/files/${key ?? ''}`)
      .set(bearerAuthorization(member.accessToken))
      .expect(200);

    expect(allowed.headers['content-type']).toMatch(/image\/png/);
    expect(allowed.headers['content-disposition']).toMatch(/inline;/);
  });

  it('revokes file access after the downloader leaves the room', async () => {
    const owner = await registerTestUser(httpServer, { username: 'attach_leave_owner' });
    const member = await registerTestUser(httpServer, { username: 'attach_leave_member' });
    const roomId = await createRoom(owner.accessToken, 'Leave download');

    await request(httpServer)
      .post(`/api/rooms/${roomId}/join`)
      .set(bearerAuthorization(member.accessToken))
      .expect(201);

    const uploaded = await request(httpServer)
      .post(`/api/rooms/${roomId}/attachments`)
      .set(bearerAuthorization(owner.accessToken))
      .attach('file', PNG_BUFFER, 'shared.png')
      .expect(201);

    const key = (uploaded.body as AttachmentResponse).url.split('/').at(-1);

    await request(httpServer)
      .get(`/api/files/${key ?? ''}`)
      .set(bearerAuthorization(member.accessToken))
      .expect(200);

    await request(httpServer)
      .post(`/api/rooms/${roomId}/leave`)
      .set(bearerAuthorization(member.accessToken))
      .expect(204);

    const denied = await request(httpServer)
      .get(`/api/files/${key ?? ''}`)
      .set(bearerAuthorization(member.accessToken))
      .expect(403);

    expect(denied.body).toMatchObject({ code: ROOM_ERROR_CODES.NOT_A_MEMBER });
  });

  it('refuses downloads of attachments whose parent message was deleted', async () => {
    const member = await registerTestUser(httpServer, { username: 'attach_deleted_msg' });
    const roomId = await createRoom(member.accessToken, 'Deleted message file');

    const uploaded = await request(httpServer)
      .post(`/api/rooms/${roomId}/attachments`)
      .set(bearerAuthorization(member.accessToken))
      .attach('file', PNG_BUFFER, 'gone.png')
      .expect(201);

    const attachment = uploaded.body as AttachmentResponse;
    const key = attachment.url.split('/').at(-1);

    const created = await request(httpServer)
      .post(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(member.accessToken))
      .send({
        content: 'With file',
        clientMessageId: 'msg-then-delete',
        attachmentIds: [attachment.id],
      })
      .expect(201);

    await request(httpServer)
      .get(`/api/files/${key ?? ''}`)
      .set(bearerAuthorization(member.accessToken))
      .expect(200);

    await request(httpServer)
      .delete(`/api/messages/${createdId(created.body)}`)
      .set(bearerAuthorization(member.accessToken))
      .expect(204);

    const denied = await request(httpServer)
      .get(`/api/files/${key ?? ''}`)
      .set(bearerAuthorization(member.accessToken))
      .expect(404);

    expect(denied.body).toMatchObject({ code: ATTACHMENT_ERROR_CODES.FILE_NOT_FOUND });
  });

  it('lets only one concurrent message claim the same attachment', async () => {
    const member = await registerTestUser(httpServer, { username: 'attach_race' });
    const roomId = await createRoom(member.accessToken, 'Attachment race');

    const uploaded = await request(httpServer)
      .post(`/api/rooms/${roomId}/attachments`)
      .set(bearerAuthorization(member.accessToken))
      .attach('file', PNG_BUFFER, 'race.png')
      .expect(201);

    const attachmentId = (uploaded.body as AttachmentResponse).id;

    const [first, second] = await Promise.all([
      request(httpServer)
        .post(`/api/rooms/${roomId}/messages`)
        .set(bearerAuthorization(member.accessToken))
        .send({
          content: 'First claim',
          clientMessageId: 'race-a',
          attachmentIds: [attachmentId],
        }),
      request(httpServer)
        .post(`/api/rooms/${roomId}/messages`)
        .set(bearerAuthorization(member.accessToken))
        .send({
          content: 'Second claim',
          clientMessageId: 'race-b',
          attachmentIds: [attachmentId],
        }),
    ]);

    const statuses = [first.status, second.status].sort((left, right) => left - right);
    expect(statuses).toEqual([201, 409]);

    const conflict = first.status === 409 ? first : second;
    expect(conflict.body).toMatchObject({ code: ATTACHMENT_ERROR_CODES.ATTACHMENT_ALREADY_LINKED });

    const history = await request(httpServer)
      .get(`/api/rooms/${roomId}/messages`)
      .set(bearerAuthorization(member.accessToken))
      .expect(200);

    const withFile = (history.body as { items: MessageResponse[] }).items.filter((item) =>
      item.attachments.some((attachment) => attachment.id === attachmentId),
    );
    expect(withFile).toHaveLength(1);
  });

  it('returns not found when the stored file is missing from disk', async () => {
    const member = await registerTestUser(httpServer, { username: 'attach_missing_disk' });
    const roomId = await createRoom(member.accessToken, 'Missing disk file');

    const uploaded = await request(httpServer)
      .post(`/api/rooms/${roomId}/attachments`)
      .set(bearerAuthorization(member.accessToken))
      .attach('file', PNG_BUFFER, 'missing.png')
      .expect(201);

    const attachment = uploaded.body as AttachmentResponse;
    const key = attachment.url.split('/').at(-1);
    expect(key).toEqual(expect.any(String));

    await unlink(path.join(storageDir, key ?? ''));

    const denied = await request(httpServer)
      .get(`/api/files/${key ?? ''}`)
      .set(bearerAuthorization(member.accessToken))
      .expect(404);

    expect(denied.body).toMatchObject({ code: ATTACHMENT_ERROR_CODES.FILE_NOT_FOUND });
  });

  it('rejects message creation without a file field', async () => {
    const member = await registerTestUser(httpServer, { username: 'attach_missing' });
    const roomId = await createRoom(member.accessToken, 'Missing file');

    const response = await request(httpServer)
      .post(`/api/rooms/${roomId}/attachments`)
      .set(bearerAuthorization(member.accessToken))
      .expect(400);

    expect(response.body).toMatchObject({ code: API_ERROR_CODES.VALIDATION_FAILED });
  });
});
