import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { API_ERROR_CODES } from '@pulse-chat/shared';

import { ApiException } from '../../common/errors/api.exception.js';
import type { AppConfigService } from '../../config/index.js';
import type { RedisClient } from '../../infrastructure/redis/redis-client.interface.js';
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
  const incrementWithTtl = vi.fn<RedisClient['incrementWithTtl']>();
  const redis = { incrementWithTtl } as unknown as RedisClient;
  const config = {
    rateLimit: {
      login: 5,
      register: 5,
      authWindowSeconds: 60,
    },
  } as AppConfigService;

  const guard = new AuthRateLimitGuard(redis, config);

  it('allows login attempts under the configured limit', async () => {
    incrementWithTtl.mockResolvedValue(1);

    await expect(guard.canActivate(createContext('/api/auth/login') as never)).resolves.toBe(true);
    expect(incrementWithTtl).toHaveBeenCalledWith('rate-limit:auth:login:127.0.0.1', 60);
  });

  it('rejects login attempts over the configured limit', async () => {
    incrementWithTtl.mockResolvedValue(6);

    await expect(guard.canActivate(createContext('/api/auth/login') as never)).rejects.toBeInstanceOf(
      ApiException,
    );

    try {
      await guard.canActivate(createContext('/api/auth/login') as never);
    } catch (error) {
      expect((error as ApiException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect((error as ApiException).code).toBe(API_ERROR_CODES.TOO_MANY_REQUESTS);
    }
  });

  it('uses a separate counter for registration', async () => {
    incrementWithTtl.mockResolvedValue(1);

    await expect(guard.canActivate(createContext('/api/auth/register') as never)).resolves.toBe(
      true,
    );
    expect(incrementWithTtl).toHaveBeenCalledWith('rate-limit:auth:register:127.0.0.1', 60);
  });
});
