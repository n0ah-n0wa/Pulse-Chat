import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_ERROR_CODES } from '@pulse-chat/shared';

import type { ApiClientError } from '../lib/errors';
import { useAuthStore } from '../store/auth-store';
import { apiClient } from './api-client';

describe('apiClient', () => {
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

  it('sends JSON requests with bearer auth', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await apiClient.post('/api/auth/login', { email: 'a@example.com', password: 'secret' });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'a@example.com', password: 'secret' }),
      }),
    );

    const [, requestInit] = fetchMock.mock.calls[0]!;
    const headers = new Headers(requestInit!.headers);
    expect(headers.get('Authorization')).toBe('Bearer access-token');
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('throws ApiClientError for failed responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          statusCode: 401,
          code: API_ERROR_CODES.UNAUTHORIZED,
          message: 'Invalid credentials.',
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    await expect(apiClient.get('/api/users/me')).rejects.toEqual(
      expect.objectContaining<Partial<ApiClientError>>({
        statusCode: 401,
        code: API_ERROR_CODES.UNAUTHORIZED,
        message: 'Invalid credentials.',
      }),
    );
  });
});
