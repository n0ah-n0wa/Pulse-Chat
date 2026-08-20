import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../store/auth-store';
import { authService } from './auth-service';

describe('authService', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: null,
      refreshToken: null,
      user: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts login requests without attaching bearer auth', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await authService.login({ email: 'alice@example.com', password: 'password123' });

    const [, requestInit] = fetchMock.mock.calls[0]!;
    const headers = new Headers(requestInit!.headers);
    expect(headers.get('Authorization')).toBeNull();
  });

  it('posts logout requests with the refresh token body', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));

    await authService.logout('refresh-token');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ refreshToken: 'refresh-token' }),
      }),
    );
  });
});
