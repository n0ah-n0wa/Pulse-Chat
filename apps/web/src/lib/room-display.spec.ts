import { describe, expect, it } from 'vitest';

import { ROOM_TYPES } from '@pulse-chat/shared';

import { findDirectRoomWithPeer, roomDisplayName, roomTypeLabel } from './room-display';

describe('roomDisplayName', () => {
  it('uses the peer name for direct rooms', () => {
    expect(
      roomDisplayName(
        {
          id: '1',
          type: ROOM_TYPES.DIRECT,
          createdAt: '2026-08-18T00:00:00.000Z',
          updatedAt: '2026-08-18T00:00:00.000Z',
        },
        { username: 'bob', displayName: 'Bob Builder' },
      ),
    ).toBe('Bob Builder');
  });

  it('uses peer fields on the room when no profile is passed', () => {
    expect(
      roomDisplayName({
        id: '1',
        type: ROOM_TYPES.DIRECT,
        peerUserId: '507f1f77bcf86cd799439012',
        peerUsername: 'bob',
        peerDisplayName: 'Bob Builder',
        createdAt: '2026-08-18T00:00:00.000Z',
        updatedAt: '2026-08-18T00:00:00.000Z',
      }),
    ).toBe('Bob Builder');
  });

  it('falls back for unnamed direct rooms', () => {
    expect(
      roomDisplayName({
        id: '1',
        type: ROOM_TYPES.DIRECT,
        createdAt: '2026-08-18T00:00:00.000Z',
        updatedAt: '2026-08-18T00:00:00.000Z',
      }),
    ).toBe('Direct message');
  });

  it('uses the stored name when present', () => {
    expect(
      roomTypeLabel({
        id: '1',
        name: 'General',
        type: ROOM_TYPES.PUBLIC,
        createdAt: '2026-08-18T00:00:00.000Z',
        updatedAt: '2026-08-18T00:00:00.000Z',
      }),
    ).toBe('Public');
  });
});

describe('findDirectRoomWithPeer', () => {
  it('finds an existing direct room by peer', () => {
    const room = {
      id: '1',
      type: ROOM_TYPES.DIRECT,
      peerUserId: '507f1f77bcf86cd799439012',
      createdAt: '2026-08-18T00:00:00.000Z',
      updatedAt: '2026-08-18T00:00:00.000Z',
    };

    expect(findDirectRoomWithPeer([room], '507f1f77bcf86cd799439012')?.id).toBe('1');
    expect(findDirectRoomWithPeer([room], '507f1f77bcf86cd799439099')).toBeUndefined();
  });
});
