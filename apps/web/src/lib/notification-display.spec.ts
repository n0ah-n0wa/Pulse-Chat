import { describe, expect, it } from 'vitest';

import { NOTIFICATION_TYPES } from '@pulse-chat/shared';

import { notificationRoomPath } from './notification-display';

const base = {
  id: '507f1f77bcf86cd799439061',
  userId: '507f1f77bcf86cd799439011',
  referenceId: '507f1f77bcf86cd799439041',
  actorId: '507f1f77bcf86cd799439012',
  isRead: false,
  createdAt: '2026-08-18T00:00:00.000Z',
} as const;

describe('notificationRoomPath', () => {
  it('opens the stored room for replies and direct messages', () => {
    expect(
      notificationRoomPath({
        ...base,
        type: NOTIFICATION_TYPES.REPLY,
        roomId: '507f1f77bcf86cd799439021',
      }),
    ).toBe('/app/rooms/507f1f77bcf86cd799439021');

    expect(
      notificationRoomPath({
        ...base,
        type: NOTIFICATION_TYPES.DIRECT_MESSAGE,
        roomId: '507f1f77bcf86cd799439022',
      }),
    ).toBe('/app/rooms/507f1f77bcf86cd799439022');
  });

  it('uses the invitation reference as the room when roomId is omitted', () => {
    expect(
      notificationRoomPath({
        ...base,
        type: NOTIFICATION_TYPES.ROOM_INVITATION,
        referenceId: '507f1f77bcf86cd799439021',
      }),
    ).toBe('/app/rooms/507f1f77bcf86cd799439021');
  });

  it('does not invent a room for message notifications without roomId', () => {
    expect(
      notificationRoomPath({
        ...base,
        type: NOTIFICATION_TYPES.MENTION,
      }),
    ).toBeUndefined();
  });
});
