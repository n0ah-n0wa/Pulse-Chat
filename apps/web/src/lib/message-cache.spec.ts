import { describe, expect, it } from 'vitest';

import type { MessageResponse } from '@pulse-chat/shared';

import {
  flattenMessagesChronological,
  mergePendingOptimisticMessages,
  upsertMessageInPages,
  type MessagesInfiniteData,
} from './message-cache';
import { optimisticMessageIdForClient } from './message-utils';

function message(overrides: Partial<MessageResponse> = {}): MessageResponse {
  return {
    id: '507f1f77bcf86cd799439041',
    roomId: '507f1f77bcf86cd799439021',
    authorId: '507f1f77bcf86cd799439011',
    content: 'Hello',
    clientMessageId: 'client-1',
    attachments: [],
    reactions: [],
    createdAt: '2026-08-18T00:00:00.000Z',
    updatedAt: '2026-08-18T00:00:00.000Z',
    ...overrides,
  };
}

describe('message-cache', () => {
  it('flattens newest-first pages into chronological order', () => {
    const data: MessagesInfiniteData = {
      pageParams: [undefined, 'older-cursor'],
      pages: [
        {
          items: [
            message({ id: '3', content: 'newest', createdAt: '2026-08-18T00:03:00.000Z' }),
            message({ id: '2', content: 'middle', createdAt: '2026-08-18T00:02:00.000Z' }),
          ],
        },
        {
          items: [message({ id: '1', content: 'oldest', createdAt: '2026-08-18T00:01:00.000Z' })],
          nextCursor: undefined,
        },
      ],
    };

    expect(flattenMessagesChronological(data).map((item) => item.id)).toEqual(['1', '2', '3']);
  });

  it('upserts a new message at the front of the newest page', () => {
    const current: MessagesInfiniteData = {
      pageParams: [undefined],
      pages: [{ items: [message({ id: '1', clientMessageId: 'a' })] }],
    };

    const next = upsertMessageInPages(
      current,
      message({ id: '2', clientMessageId: 'b', content: 'New' }),
    );

    expect(next?.pages[0]?.items.map((item) => item.id)).toEqual(['2', '1']);
  });

  it('replaces an existing message matched by clientMessageId', () => {
    const current: MessagesInfiniteData = {
      pageParams: [undefined],
      pages: [{ items: [message({ id: 'temp', clientMessageId: 'pending' })] }],
    };

    const next = upsertMessageInPages(
      current,
      message({ id: '507f1f77bcf86cd799439099', clientMessageId: 'pending', content: 'Saved' }),
    );

    expect(next?.pages[0]?.items).toHaveLength(1);
    expect(next?.pages[0]?.items[0]?.id).toBe('507f1f77bcf86cd799439099');
    expect(next?.pages[0]?.items[0]?.content).toBe('Saved');
  });

  it('does not insert a duplicate when the same id already exists', () => {
    const current: MessagesInfiniteData = {
      pageParams: [undefined],
      pages: [{ items: [message({ id: '1', clientMessageId: 'a' })] }],
    };

    const next = upsertMessageInPages(
      current,
      message({ id: '1', clientMessageId: 'a', content: 'Hello again' }),
    );

    expect(next?.pages[0]?.items).toHaveLength(1);
    expect(next?.pages[0]?.items[0]?.content).toBe('Hello again');
  });

  it('collapses duplicate rows that share an id or clientMessageId', () => {
    const current: MessagesInfiniteData = {
      pageParams: [undefined],
      pages: [
        {
          items: [
            message({ id: 'temp', clientMessageId: 'pending', content: 'Pending' }),
            message({
              id: '507f1f77bcf86cd799439041',
              clientMessageId: 'pending',
              content: 'Saved',
            }),
          ],
        },
      ],
    };

    const next = upsertMessageInPages(
      current,
      message({ id: '507f1f77bcf86cd799439041', clientMessageId: 'pending', content: 'Saved' }),
    );

    expect(next?.pages[0]?.items).toHaveLength(1);
    expect(next?.pages[0]?.items[0]?.id).toBe('507f1f77bcf86cd799439041');
  });

  it('keeps pending optimistic rows when reconciling a refetch', () => {
    const previous: MessagesInfiniteData = {
      pageParams: [undefined],
      pages: [
        {
          items: [
            message({
              id: optimisticMessageIdForClient('pending-outbox'),
              clientMessageId: 'pending-outbox',
              content: 'Still sending',
            }),
          ],
        },
      ],
    };
    const fetched: MessagesInfiniteData = {
      pageParams: [undefined],
      pages: [{ items: [message({ id: 'server-1', clientMessageId: 'server-1' })] }],
    };

    const merged = mergePendingOptimisticMessages(fetched, previous);
    expect(merged?.pages[0]?.items.map((item) => item.clientMessageId)).toEqual([
      'pending-outbox',
      'server-1',
    ]);
  });
});
