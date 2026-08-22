import { HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { API_ERROR_CODES } from '@pulse-chat/shared';

import { ApiException } from '../common/errors/api.exception.js';
import { RATE_LIMIT_ACTIONS } from './rate-limit.keys.js';
import type { RateLimitService } from './rate-limit.service.js';
import { UserRateLimitGuard } from './user-rate-limit.guard.js';

function createContext(userId: string | undefined) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        user: userId === undefined ? undefined : { userId },
      }),
    }),
  };
}

describe('UserRateLimitGuard', () => {
  const consume = vi.fn<RateLimitService['consume']>();
  const getAllAndOverride = vi.fn();
  const guard = new UserRateLimitGuard(
    { getAllAndOverride } as never,
    { consume } as unknown as RateLimitService,
  );

  beforeEach(() => {
    consume.mockReset();
    getAllAndOverride.mockReset();
  });

  it('skips handlers that are not marked for rate limiting', async () => {
    getAllAndOverride.mockReturnValue(undefined);

    await expect(guard.canActivate(createContext('user-1') as never)).resolves.toBe(true);
    expect(consume).not.toHaveBeenCalled();
  });

  it('consumes the per-user counter for the annotated action', async () => {
    getAllAndOverride.mockReturnValue(RATE_LIMIT_ACTIONS.MESSAGES);
    consume.mockResolvedValue(undefined);

    await expect(guard.canActivate(createContext('user-1') as never)).resolves.toBe(true);
    expect(consume).toHaveBeenCalledWith(RATE_LIMIT_ACTIONS.MESSAGES, 'user-1');
  });

  it('rejects unauthenticated requests before hitting Redis', async () => {
    getAllAndOverride.mockReturnValue(RATE_LIMIT_ACTIONS.SEARCH);

    await expect(guard.canActivate(createContext(undefined) as never)).rejects.toMatchObject({
      code: API_ERROR_CODES.UNAUTHORIZED,
    });
    expect(consume).not.toHaveBeenCalled();
  });

  it('propagates a consistent 429 when the user is over the limit', async () => {
    getAllAndOverride.mockReturnValue(RATE_LIMIT_ACTIONS.UPLOADS);
    consume.mockRejectedValue(
      new ApiException(
        API_ERROR_CODES.TOO_MANY_REQUESTS,
        'Too many requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      ),
    );

    await expect(guard.canActivate(createContext('user-1') as never)).rejects.toMatchObject({
      code: API_ERROR_CODES.TOO_MANY_REQUESTS,
    });
  });
});
