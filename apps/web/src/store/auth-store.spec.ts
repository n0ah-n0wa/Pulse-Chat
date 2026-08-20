import { beforeEach, describe, expect, it } from 'vitest';

import type { AuthSessionResponse } from '@pulse-chat/shared';
import { TOKEN_TYPE, USER_ROLES } from '@pulse-chat/shared';

import { useAuthStore } from './auth-store';

const session: AuthSessionResponse = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
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
};

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.getState().clearSession();
  });

  it('stores and clears an authenticated session', () => {
    useAuthStore.getState().setSession(session);

    expect(useAuthStore.getState().isAuthenticated()).toBe(true);
    expect(useAuthStore.getState().user?.username).toBe('alice');

    useAuthStore.getState().clearSession();

    expect(useAuthStore.getState().isAuthenticated()).toBe(false);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});
