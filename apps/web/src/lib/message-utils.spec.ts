import { describe, expect, it } from 'vitest';

import {
  createClientMessageId,
  optimisticMessageIdForClient,
  shouldGroupWithPrevious,
} from './message-utils';

describe('message-utils', () => {
  it('groups consecutive messages from the same author within five minutes', () => {
    expect(
      shouldGroupWithPrevious(
        {
          authorId: 'a',
          createdAt: '2026-08-18T00:00:00.000Z',
        },
        {
          authorId: 'a',
          createdAt: '2026-08-18T00:04:00.000Z',
        },
      ),
    ).toBe(true);
  });

  it('does not group deleted messages', () => {
    expect(
      shouldGroupWithPrevious(
        {
          authorId: 'a',
          createdAt: '2026-08-18T00:00:00.000Z',
        },
        {
          authorId: 'a',
          createdAt: '2026-08-18T00:01:00.000Z',
          deletedAt: '2026-08-18T00:01:30.000Z',
        },
      ),
    ).toBe(false);
  });

  it('creates a non-empty client message id', () => {
    expect(createClientMessageId().length).toBeGreaterThan(0);
  });

  it('uses a placeholder id that cannot collide with a Mongo ObjectId', () => {
    const clientMessageId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const optimisticId = optimisticMessageIdForClient(clientMessageId);

    expect(optimisticId).toBe(`optimistic:${clientMessageId}`);
    expect(optimisticId).not.toMatch(/^[a-f0-9]{24}$/i);
  });
});
