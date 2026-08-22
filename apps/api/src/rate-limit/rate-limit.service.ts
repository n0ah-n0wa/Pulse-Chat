import { HttpStatus, Inject, Injectable } from '@nestjs/common';

import { API_ERROR_CODES } from '@pulse-chat/shared';

import { ApiException } from '../common/errors/api.exception.js';
import { AppConfigService } from '../config/index.js';
import type { RedisClient } from '../infrastructure/redis/redis-client.interface.js';
import { REDIS_CLIENT } from '../infrastructure/tokens.js';
import { RATE_LIMIT_ACTIONS, rateLimitKey, type RateLimitAction } from './rate-limit.keys.js';

export const RATE_LIMIT_ERROR_MESSAGE = 'Too many requests. Please try again later.';

interface RateLimitPolicy {
  readonly limit: number;
  readonly windowSeconds: number;
}

/**
 * Fixed-window rate limiter backed by Redis {@link RedisClient.incrementWithTtl}.
 *
 * Every Nest instance shares the same counters, so limits hold across a
 * multi-instance deployment (specification section 33).
 */
@Injectable()
export class RateLimitService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
    private readonly config: AppConfigService,
  ) {}

  async consume(action: RateLimitAction, subject: string): Promise<void> {
    const policy = this.policyFor(action);
    const count = await this.redis.incrementWithTtl(
      rateLimitKey(action, subject),
      policy.windowSeconds,
    );

    if (count > policy.limit) {
      throw new ApiException(
        API_ERROR_CODES.TOO_MANY_REQUESTS,
        RATE_LIMIT_ERROR_MESSAGE,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private policyFor(action: RateLimitAction): RateLimitPolicy {
    const { rateLimit } = this.config;

    switch (action) {
      case RATE_LIMIT_ACTIONS.LOGIN:
        return { limit: rateLimit.login, windowSeconds: rateLimit.authWindowSeconds };
      case RATE_LIMIT_ACTIONS.REGISTER:
        return { limit: rateLimit.register, windowSeconds: rateLimit.authWindowSeconds };
      case RATE_LIMIT_ACTIONS.REFRESH:
      case RATE_LIMIT_ACTIONS.LOGOUT:
        return { limit: rateLimit.login, windowSeconds: rateLimit.authWindowSeconds };
      case RATE_LIMIT_ACTIONS.MESSAGES:
        return { limit: rateLimit.messages, windowSeconds: rateLimit.messagesWindowSeconds };
      case RATE_LIMIT_ACTIONS.TYPING:
        return { limit: rateLimit.messages, windowSeconds: rateLimit.messagesWindowSeconds };
      case RATE_LIMIT_ACTIONS.SEARCH:
        return { limit: rateLimit.search, windowSeconds: rateLimit.searchWindowSeconds };
      case RATE_LIMIT_ACTIONS.UPLOADS:
        return { limit: rateLimit.uploads, windowSeconds: rateLimit.uploadsWindowSeconds };
    }
  }
}
