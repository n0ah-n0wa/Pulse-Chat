import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TOKEN_TYPE, USER_ROLES } from '@pulse-chat/shared';

import { queryKeys } from './query-keys';
import { resetClientState } from './reset-client-state';
import { currentSessionGeneration } from './session-generation';
import { getSocketService, resetSocketServiceForTests } from '../services/socket-service';
import { useAuthStore } from '../store/auth-store';
import { usePresenceStore } from '../store/presence-store';
import { useRoomTypingStore } from '../store/room-typing-store';
import { useSocketStore } from '../store/socket-store';
import { useUnreadStore } from '../store/unread-store';

describe('resetClientState', () => {
  beforeEach(() => {
    useAuthStore.getState().setSession({
      accessToken: 'access',
      refreshToken: 'refresh',
      accessTokenExpiresIn: 900,
      tokenType: TOKEN_TYPE,
      user: {
        id: '507f1f77bcf86cd799439011',
        username: 'alice',
        displayName: 'Alice',
        email: 'alice@example.com',
        role: USER_ROLES.USER,
        createdAt: '2026-08-18T00:00:00.000Z',
        updatedAt: '2026-08-18T00:00:00.000Z',
      },
    });
    usePresenceStore.getState().setUserOnline('507f1f77bcf86cd799439012');
    useUnreadStore.getState().increment('room-1');
    useRoomTypingStore.getState().applyTypingStarted({ roomId: 'room-1', userId: 'other' });
    getSocketService();
    useSocketStore.getState().setConnectionState('connected');
  });

  afterEach(() => {
    resetSocketServiceForTests();
    useAuthStore.getState().clearSession();
    usePresenceStore.getState().resetPresence();
    useUnreadStore.getState().reset();
    useRoomTypingStore.getState().reset();
  });

  it('clears query cache, auth, presence, unread, and typing', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.rooms.list(), [{ id: 'room-1' }]);
    const generation = currentSessionGeneration();

    resetClientState(queryClient);

    expect(queryClient.getQueryData(queryKeys.rooms.list())).toBeUndefined();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(usePresenceStore.getState().onlineUserIds.size).toBe(0);
    expect(useUnreadStore.getState().increments).toEqual({});
    expect(useRoomTypingStore.getState().expiresByRoom).toEqual({});
    expect(useSocketStore.getState().connectionState).toBe('disconnected');
    expect(currentSessionGeneration()).toBe(generation + 1);
  });
});
