import { describe, expect, it } from 'vitest';

import { MEMBERSHIP_ROLES, ROOM_TYPES } from '@pulse-chat/shared';

import { canInviteToRoom, roomMatchesQuery } from './room-search';

const publicRoom = {
  id: '1',
  name: 'General',
  description: 'Company-wide',
  type: ROOM_TYPES.PUBLIC,
  currentUserRole: MEMBERSHIP_ROLES.OWNER,
  createdAt: '2026-08-18T00:00:00.000Z',
  updatedAt: '2026-08-18T00:00:00.000Z',
} as const;

describe('roomMatchesQuery', () => {
  it('matches room name, type, and direct-message peer', () => {
    expect(roomMatchesQuery(publicRoom, 'gen')).toBe(true);
    expect(roomMatchesQuery(publicRoom, 'public')).toBe(true);
    expect(roomMatchesQuery(publicRoom, 'secret')).toBe(false);
    expect(roomMatchesQuery(publicRoom, '#gen')).toBe(true);
    expect(
      roomMatchesQuery(
        {
          id: '2',
          type: ROOM_TYPES.DIRECT,
          peerUserId: '507f1f77bcf86cd799439012',
          peerUsername: 'maria',
          peerDisplayName: 'Maria',
          createdAt: '2026-08-18T00:00:00.000Z',
          updatedAt: '2026-08-18T00:00:00.000Z',
        },
        '@maria',
      ),
    ).toBe(true);
    expect(
      roomMatchesQuery(
        {
          id: '2',
          type: ROOM_TYPES.DIRECT,
          peerUserId: '507f1f77bcf86cd799439012',
          createdAt: '2026-08-18T00:00:00.000Z',
          updatedAt: '2026-08-18T00:00:00.000Z',
        },
        'maria',
        { username: 'maria', displayName: 'Maria' },
      ),
    ).toBe(true);
  });
});

describe('canInviteToRoom', () => {
  it('allows owners and moderators of public or private rooms', () => {
    expect(canInviteToRoom(publicRoom)).toBe(true);
    expect(
      canInviteToRoom({
        ...publicRoom,
        type: ROOM_TYPES.PRIVATE,
        currentUserRole: MEMBERSHIP_ROLES.MODERATOR,
      }),
    ).toBe(true);
    expect(canInviteToRoom({ ...publicRoom, currentUserRole: MEMBERSHIP_ROLES.MEMBER })).toBe(
      false,
    );
    expect(
      canInviteToRoom({
        id: '3',
        type: ROOM_TYPES.DIRECT,
        currentUserRole: MEMBERSHIP_ROLES.MEMBER,
        createdAt: '2026-08-18T00:00:00.000Z',
        updatedAt: '2026-08-18T00:00:00.000Z',
      }),
    ).toBe(false);
  });
});
