import { describe, expect, it } from 'vitest';

import { ROOM_TYPES } from '@pulse-chat/shared';

import { roomDisplayName, roomTypeLabel } from './room-display';

describe('roomDisplayName', () => {
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
