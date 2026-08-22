import { describe, expect, it } from 'vitest';

import { patchNotificationReadState, prependNotification } from './notification-cache';

const notification = {
  id: '507f1f77bcf86cd799439061',
  userId: '507f1f77bcf86cd799439011',
  type: 'mention' as const,
  referenceId: '507f1f77bcf86cd799439041',
  roomId: '507f1f77bcf86cd799439021',
  actorId: '507f1f77bcf86cd799439012',
  isRead: false,
  createdAt: '2026-08-18T00:00:00.000Z',
};

describe('notification-cache', () => {
  it('prepends realtime notifications without duplicates', () => {
    const first = prependNotification(undefined, notification);
    expect(first.items).toHaveLength(1);

    const second = prependNotification(first, notification);
    expect(second.items).toHaveLength(1);
  });

  it('patches read state for a single notification', () => {
    const list = prependNotification(undefined, notification);
    const updated = { ...notification, isRead: true };
    const next = patchNotificationReadState(list, updated);

    expect(next?.items[0]?.isRead).toBe(true);
  });
});
