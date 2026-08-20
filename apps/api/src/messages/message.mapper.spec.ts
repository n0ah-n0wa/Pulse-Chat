import { describe, expect, it } from 'vitest';

import type { MessageRecord } from './message.repository.interface.js';
import { toMessageListResponse, toMessageResponse } from './message.mapper.js';

const BASE_TIME = new Date('2026-08-18T00:00:00.000Z');

function message(overrides: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id: '507f1f77bcf86cd799439041',
    roomId: '507f1f77bcf86cd799439021',
    authorId: '507f1f77bcf86cd799439011',
    content: 'Hello',
    clientMessageId: 'client-1',
    attachments: [],
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    ...overrides,
  };
}

describe('toMessageResponse', () => {
  it('maps persisted fields to explicit ISO timestamps without internal ids', () => {
    expect(toMessageResponse(message())).toEqual({
      id: '507f1f77bcf86cd799439041',
      roomId: '507f1f77bcf86cd799439021',
      authorId: '507f1f77bcf86cd799439011',
      content: 'Hello',
      clientMessageId: 'client-1',
      attachments: [],
      reactions: [],
      createdAt: '2026-08-18T00:00:00.000Z',
      updatedAt: '2026-08-18T00:00:00.000Z',
    });
  });

  it('includes optional edit and reply fields when present', () => {
    const editedAt = new Date('2026-08-18T01:00:00.000Z');
    const mapped = toMessageResponse(
      message({
        replyToMessageId: '507f1f77bcf86cd799439042',
        editedAt,
      }),
    );

    expect(mapped.replyToMessageId).toBe('507f1f77bcf86cd799439042');
    expect(mapped.editedAt).toBe(editedAt.toISOString());
    expect(mapped.content).toBe('Hello');
  });

  it('hides original content on deleted messages unless explicitly authorized', () => {
    const deletedAt = new Date('2026-08-18T01:00:00.000Z');
    const deleted = message({
      content: 'secret',
      attachments: [{ id: 'file-1' }],
      deletedAt,
    });

    expect(toMessageResponse(deleted)).toMatchObject({
      content: '',
      attachments: [],
      reactions: [],
      deletedAt: deletedAt.toISOString(),
    });

    expect(
      toMessageResponse(deleted, {
        includeDeletedContent: true,
        attachments: [
          {
            id: 'file-1',
            filename: 'file.txt',
            mimeType: 'text/plain',
            sizeBytes: 1,
            url: '/api/files/file-1',
            createdAt: '2026-08-18T00:00:00.000Z',
          },
        ],
      }),
    ).toMatchObject({
      content: 'secret',
      attachments: [
        {
          id: 'file-1',
          filename: 'file.txt',
          mimeType: 'text/plain',
          sizeBytes: 1,
          url: '/api/files/file-1',
          createdAt: '2026-08-18T00:00:00.000Z',
        },
      ],
      deletedAt: deletedAt.toISOString(),
    });
  });

  it('uses hydrated attachment metadata when provided', () => {
    const mapped = toMessageResponse(message(), {
      attachments: [
        {
          id: '507f1f77bcf86cd799439060',
          filename: 'photo.png',
          mimeType: 'image/png',
          sizeBytes: 128,
          url: '/api/files/key.png',
          createdAt: '2026-08-18T00:00:00.000Z',
        },
      ],
    });

    expect(mapped.attachments).toHaveLength(1);
    expect(mapped.attachments[0]?.filename).toBe('photo.png');
  });
});

describe('toMessageListResponse', () => {
  it('omits nextCursor when the page is complete', () => {
    expect(toMessageListResponse([message()], false)).toEqual({
      items: [toMessageResponse(message())],
    });
  });

  it('sets nextCursor to the oldest message id when more pages exist', () => {
    const newer = message({ id: '507f1f77bcf86cd799439051' });
    const older = message({ id: '507f1f77bcf86cd799439050' });

    expect(toMessageListResponse([newer, older], true).nextCursor).toBe(older.id);
  });

  it('includes reply metadata and aggregated reactions when provided', () => {
    const mapped = toMessageResponse(message({ replyToMessageId: '507f1f77bcf86cd799439099' }), {
      replyTo: {
        id: '507f1f77bcf86cd799439099',
        authorId: '507f1f77bcf86cd799439012',
        content: 'Original',
        createdAt: new Date('2026-08-18T00:05:00.000Z'),
      },
      reactions: [{ emoji: '👍', count: 2, reactedByCurrentUser: true }],
    });

    expect(mapped.replyTo).toMatchObject({
      id: '507f1f77bcf86cd799439099',
      authorId: '507f1f77bcf86cd799439012',
      content: 'Original',
    });
    expect(mapped.reactions).toEqual([{ emoji: '👍', count: 2, reactedByCurrentUser: true }]);
  });
});
