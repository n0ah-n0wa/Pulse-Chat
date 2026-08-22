import { describe, expect, it } from 'vitest';

import type { MessageResponse } from '@pulse-chat/shared';

import { countUnreadMessages, isMessageAfterCursor } from './unread-count';

function message(id: string): MessageResponse {
  return {
    id,
    roomId: '507f1f77bcf86cd799439021',
    authorId: '507f1f77bcf86cd799439011',
    content: 'Hi',
    clientMessageId: `client-${id}`,
    attachments: [],
    reactions: [],
    createdAt: '2026-08-18T00:00:00.000Z',
    updatedAt: '2026-08-18T00:00:00.000Z',
  };
}

describe('unread-count', () => {
  it('compares message ids lexicographically as read cursor', () => {
    expect(isMessageAfterCursor('507f1f77bcf86cd799439099', '507f1f77bcf86cd799439011')).toBe(true);
    expect(isMessageAfterCursor('507f1f77bcf86cd799439011', '507f1f77bcf86cd799439099')).toBe(
      false,
    );
    expect(isMessageAfterCursor('507f1f77bcf86cd799439011', undefined)).toBe(true);
  });

  it('counts unread messages after the read cursor', () => {
    const messages = [
      message('507f1f77bcf86cd799439011'),
      message('507f1f77bcf86cd799439041'),
      message('507f1f77bcf86cd799439051'),
    ];

    expect(countUnreadMessages(messages, '507f1f77bcf86cd799439011')).toBe(2);
    expect(countUnreadMessages(messages, '507f1f77bcf86cd799439051')).toBe(0);
    expect(countUnreadMessages(messages, undefined)).toBe(3);
  });

  it('adds realtime increments for messages not yet in cache', () => {
    const messages = [message('507f1f77bcf86cd799439011')];
    expect(countUnreadMessages(messages, '507f1f77bcf86cd799439011', 3)).toBe(3);
  });
});
