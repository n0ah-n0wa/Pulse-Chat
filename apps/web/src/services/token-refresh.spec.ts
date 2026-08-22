import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TOKEN_TYPE } from '@pulse-chat/shared';

import { queryClient } from '../lib/query-client';
import { resetClientState } from '../lib/reset-client-state';
import { currentSessionGeneration } from '../lib/session-generation';
import { useAuthStore } from '../store/auth-store';
import { refreshAccessToken } from './token-refresh';

function tokensResponse(accessToken: string, refreshToken: string): Response {
  return new Response(
    JSON.stringify({
      accessToken,
      refreshToken,
      accessTokenExpiresIn: 900,
      tokenType: TOKEN_TYPE,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('refreshAccessToken', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().clearSession();
  });

  it('rotates tokens from a successful refresh response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(tokensResponse('next-access', 'next-refresh'));

    await expect(refreshAccessToken()).resolves.toBe(true);
    expect(useAuthStore.getState().accessToken).toBe('next-access');
    expect(useAuthStore.getState().refreshToken).toBe('next-refresh');
  });

  it('does not restore tokens after the session is cleared during rotation', async () => {
    let finishRefresh: ((response: Response) => void) | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finishRefresh = resolve;
        }),
    );

    const pending = refreshAccessToken();
    resetClientState(queryClient);

    expect(useAuthStore.getState().accessToken).toBeNull();
    const generationAfterLogout = currentSessionGeneration();

    finishRefresh?.(tokensResponse('stolen-access', 'stolen-refresh'));
    await expect(pending).resolves.toBe(false);

    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
    expect(currentSessionGeneration()).toBe(generationAfterLogout);
  });
});
