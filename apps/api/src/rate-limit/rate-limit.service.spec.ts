import { HttpStatus } from '@nestjs/common';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { API_ERROR_CODES } from '@pulse-chat/shared';

import { ApiException } from '../common/errors/api.exception.js';
import type { AppConfigService } from '../config/index.js';
import { TestRedisService } from '../test/test-redis.service.js';
import { RATE_LIMIT_ACTIONS, rateLimitKey } from './rate-limit.keys.js';
import { RATE_LIMIT_ERROR_MESSAGE, RateLimitService } from './rate-limit.service.js';

function createConfig(overrides: Partial<AppConfigService['rateLimit']> = {}): AppConfigService {
  return {
    rateLimit: {
      messages: 2,
      messagesWindowSeconds: 60,
      login: 3,
      register: 3,
      authWindowSeconds: 60,
      search: 2,
      searchWindowSeconds: 60,
      uploads: 2,
      uploadsWindowSeconds: 60,
      ...overrides,
    },
  } as AppConfigService;
}

describe('RateLimitService', () => {
  const redis = new TestRedisService();

  afterEach(async () => {
    const keys = [
      rateLimitKey(RATE_LIMIT_ACTIONS.MESSAGES, 'user-1'),
      rateLimitKey(RATE_LIMIT_ACTIONS.LOGIN, '127.0.0.1'),
      rateLimitKey(RATE_LIMIT_ACTIONS.REFRESH, '127.0.0.1'),
      rateLimitKey(RATE_LIMIT_ACTIONS.SEARCH, 'user-1'),
    ];
    await redis.del(...keys);
  });

  afterAll(async () => {
    await redis.dispose();
  });

  it('allows requests below the configured limit', async () => {
    const service = new RateLimitService(redis, createConfig({ messages: 3 }));

    await expect(service.consume(RATE_LIMIT_ACTIONS.MESSAGES, 'user-1')).resolves.toBeUndefined();
    await expect(service.consume(RATE_LIMIT_ACTIONS.MESSAGES, 'user-1')).resolves.toBeUndefined();
    await expect(service.consume(RATE_LIMIT_ACTIONS.MESSAGES, 'user-1')).resolves.toBeUndefined();
  });

  it('rejects the request that exceeds the configured limit', async () => {
    const service = new RateLimitService(redis, createConfig({ messages: 2 }));

    await service.consume(RATE_LIMIT_ACTIONS.MESSAGES, 'user-1');
    await service.consume(RATE_LIMIT_ACTIONS.MESSAGES, 'user-1');

    await expect(service.consume(RATE_LIMIT_ACTIONS.MESSAGES, 'user-1')).rejects.toMatchObject({
      code: API_ERROR_CODES.TOO_MANY_REQUESTS,
    });

    try {
      await service.consume(RATE_LIMIT_ACTIONS.MESSAGES, 'user-1');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiException);
      const body = (error as ApiException).getResponse() as {
        statusCode: number;
        code: string;
        message: string;
      };
      expect(body.statusCode).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(body.code).toBe(API_ERROR_CODES.TOO_MANY_REQUESTS);
      expect(body.message).toBe(RATE_LIMIT_ERROR_MESSAGE);
    }
  });

  it('allows traffic again after the Redis window is reset', async () => {
    const service = new RateLimitService(redis, createConfig({ login: 1 }));

    await service.consume(RATE_LIMIT_ACTIONS.LOGIN, '127.0.0.1');
    await expect(service.consume(RATE_LIMIT_ACTIONS.LOGIN, '127.0.0.1')).rejects.toMatchObject({
      code: API_ERROR_CODES.TOO_MANY_REQUESTS,
    });

    await redis.expire(rateLimitKey(RATE_LIMIT_ACTIONS.LOGIN, '127.0.0.1'), 0);

    await expect(service.consume(RATE_LIMIT_ACTIONS.LOGIN, '127.0.0.1')).resolves.toBeUndefined();
  });

  it('shares a single Redis counter across limiter instances', async () => {
    const config = createConfig({ search: 2 });
    const instanceA = new RateLimitService(redis, config);
    const instanceB = new RateLimitService(redis, config);

    await instanceA.consume(RATE_LIMIT_ACTIONS.SEARCH, 'user-1');
    await instanceB.consume(RATE_LIMIT_ACTIONS.SEARCH, 'user-1');

    await expect(instanceA.consume(RATE_LIMIT_ACTIONS.SEARCH, 'user-1')).rejects.toMatchObject({
      code: API_ERROR_CODES.TOO_MANY_REQUESTS,
    });
    await expect(instanceB.consume(RATE_LIMIT_ACTIONS.SEARCH, 'user-1')).rejects.toMatchObject({
      code: API_ERROR_CODES.TOO_MANY_REQUESTS,
    });
  });

  it('keeps refresh counters separate from login', async () => {
    const service = new RateLimitService(redis, createConfig({ login: 1 }));

    await service.consume(RATE_LIMIT_ACTIONS.LOGIN, '127.0.0.1');
    await expect(service.consume(RATE_LIMIT_ACTIONS.REFRESH, '127.0.0.1')).resolves.toBeUndefined();
  });
});
