import { describe, expect, it, beforeEach } from 'vitest';

import {
  applyUserOffline,
  applyUserOnline,
  isUserOnline,
  usePresenceStore,
} from './presence-store';

const USER_ID = '507f1f77bcf86cd799439011';

describe('presence-store', () => {
  beforeEach(() => {
    usePresenceStore.getState().resetPresence();
  });

  it('tracks online and offline transitions', () => {
    expect(isUserOnline(USER_ID)).toBe(false);

    applyUserOnline(USER_ID);
    expect(isUserOnline(USER_ID)).toBe(true);

    applyUserOffline(USER_ID);
    expect(isUserOnline(USER_ID)).toBe(false);
  });

  it('ignores duplicate offline for users not marked online', () => {
    applyUserOffline(USER_ID);
    expect(usePresenceStore.getState().onlineUserIds.size).toBe(0);
  });
});
