import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { API_ERROR_CODES } from '@pulse-chat/shared';

import { ApiException } from '../../common/errors/api.exception.js';
import type { RateLimitService } from '../../rate-limit/rate-limit.service.js';
import { AuthRateLimitGuard } from './auth-rate-limit.guard.js';

function createContext(path: string, ip = '127.0.0.1') {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        path,
        ip,
        socket: { remoteAddress: ip },
      }),
    }),
  };
}

describe('AuthRateLimitGuard', () => {
  const consume = vi.fn<RateLimitService['consume']>();
  const guard = new AuthRateLimitGuard({ consume } as unknown as RateLimitService);

  it('allows login attempts under the configured limit', async () => {
    consume.mockResolvedValue(undefined);

    await expect(guard.canActivate(createContext('/api/auth/login') as never)).resolves.toBe(true);
    expect(consume).toHaveBeenCalledWith('login', '127.0.0.1');
  });

  it('rejects login attempts over the configured limit', async () => {
    consume.mockRejectedValue(
      new ApiException(
        API_ERROR_CODES.TOO_MANY_REQUESTS,
        'Too many requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      ),
    );

    await expect(
      guard.canActivate(createContext('/api/auth/login') as never),
    ).rejects.toBeInstanceOf(ApiException);

    try {
      await guard.canActivate(createContext('/api/auth/login') as never);
    } catch (error) {
      expect((error as ApiException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect((error as ApiException).code).toBe(API_ERROR_CODES.TOO_MANY_REQUESTS);
    }
  });

  it('uses a separate counter for registration', async () => {
    consume.mockResolvedValue(undefined);

    await expect(guard.canActivate(createContext('/api/auth/register') as never)).resolves.toBe(
      true,
    );
    expect(consume).toHaveBeenCalledWith('register', '127.0.0.1');
  });

  it('rate-limits refresh and logout per IP', async () => {
    consume.mockResolvedValue(undefined);

    await expect(guard.canActivate(createContext('/api/auth/refresh') as never)).resolves.toBe(
      true,
    );
    expect(consume).toHaveBeenCalledWith('refresh', '127.0.0.1');

    consume.mockClear();
    await expect(guard.canActivate(createContext('/api/auth/logout') as never)).resolves.toBe(true);
    expect(consume).toHaveBeenCalledWith('logout', '127.0.0.1');
  });

  it('ignores unrelated paths', async () => {
    consume.mockClear();

    await expect(guard.canActivate(createContext('/api/auth/me') as never)).resolves.toBe(true);
    expect(consume).not.toHaveBeenCalled();
  });
});
