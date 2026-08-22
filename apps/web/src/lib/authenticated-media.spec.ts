import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TOKEN_TYPE } from '@pulse-chat/shared';

import { fetchAuthenticatedObjectUrl } from './authenticated-media';
import { useAuthStore } from '../store/auth-store';

function fileResponse(): Response {
  return {
    ok: true,
    status: 200,
    blob: () => Promise.resolve(new Blob()),
  } as Response;
}

describe('fetchAuthenticatedObjectUrl', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: null,
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:authenticated');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().clearSession();
  });

  it('sends the bearer token when downloading a protected file', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(fileResponse());

    await expect(fetchAuthenticatedObjectUrl('/api/files/photo.png')).resolves.toBe(
      'blob:authenticated',
    );

    const [, init] = fetchMock.mock.calls[0]!;
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer access-token');
  });

  it('refuses to attach a bearer token to an absolute third-party URL', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(fileResponse());

    await expect(
      fetchAuthenticatedObjectUrl('https://evil.example/api/files/photo.png'),
    ).rejects.toThrow('Authenticated media URL is not allowed.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses protocol-relative and traversal file paths', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(fileResponse());

    await expect(fetchAuthenticatedObjectUrl('//evil.example/api/files/photo.png')).rejects.toThrow(
      'Authenticated media URL is not allowed.',
    );
    await expect(fetchAuthenticatedObjectUrl('/api/files/../secret.png')).rejects.toThrow(
      'Authenticated media URL is not allowed.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries the download after a successful token refresh', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Expired.' }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: 'next-access',
            refreshToken: 'next-refresh',
            accessTokenExpiresIn: 900,
            tokenType: TOKEN_TYPE,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(fileResponse());

    await expect(fetchAuthenticatedObjectUrl('/api/files/photo.png')).resolves.toBe(
      'blob:authenticated',
    );
    expect(useAuthStore.getState().accessToken).toBe('next-access');
  });
});
