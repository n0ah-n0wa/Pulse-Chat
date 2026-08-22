import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyTypingStarted,
  applyTypingStopped,
  selectTypingUserIds,
  useRoomTypingStore,
} from './room-typing-store';

const ROOM_ID = '507f1f77bcf86cd799439021';
const USER_A = '507f1f77bcf86cd799439011';
const USER_B = '507f1f77bcf86cd799439012';

describe('room-typing-store', () => {
  beforeEach(() => {
    useRoomTypingStore.setState({ expiresByRoom: {} });
  });

  it('tracks typing users until stopped', () => {
    applyTypingStarted({ roomId: ROOM_ID, userId: USER_A });
    expect(selectTypingUserIds(ROOM_ID, undefined)).toEqual([USER_A]);

    applyTypingStopped({ roomId: ROOM_ID, userId: USER_A });
    expect(selectTypingUserIds(ROOM_ID, undefined)).toEqual([]);
  });

  it('excludes the current user from the typing list', () => {
    applyTypingStarted({ roomId: ROOM_ID, userId: USER_A });
    applyTypingStarted({ roomId: ROOM_ID, userId: USER_B });

    expect(selectTypingUserIds(ROOM_ID, USER_A)).toEqual([USER_B]);
  });

  it('clears every room on reset', () => {
    applyTypingStarted({ roomId: ROOM_ID, userId: USER_A });
    useRoomTypingStore.getState().reset();
    expect(useRoomTypingStore.getState().expiresByRoom).toEqual({});
  });

  it('expires typing users after the timeout elapses', () => {
    vi.useFakeTimers();
    const now = 1_700_000_000_000;
    vi.setSystemTime(now);

    applyTypingStarted({ roomId: ROOM_ID, userId: USER_A });
    expect(selectTypingUserIds(ROOM_ID, undefined)).toEqual([USER_A]);

    vi.setSystemTime(now + 1_501);
    expect(selectTypingUserIds(ROOM_ID, undefined)).toEqual([]);

    vi.useRealTimers();
  });
});
