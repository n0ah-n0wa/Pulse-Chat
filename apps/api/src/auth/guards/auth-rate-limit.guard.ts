import { HttpStatus, Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { API_ERROR_CODES } from '@pulse-chat/shared';

import { ApiException } from '../../common/errors/api.exception.js';
import { AppConfigService } from '../../config/index.js';
import type { RedisClient } from '../../infrastructure/redis/redis-client.interface.js';
import { REDIS_CLIENT } from '../../infrastructure/tokens.js';
import { authRateLimitKey, resolveAuthRateLimitAction } from '../utils/auth-rate-limit.js';
import { resolveClientIp } from '../utils/client-ip.js';

/** Redis-backed per-IP limits for login and registration (specification section 33). */
@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
    private readonly config: AppConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const action = resolveAuthRateLimitAction(request.path);

    if (action === undefined) {
      return true;
    }

    const limit = this.config.rateLimit[action];
    const count = await this.redis.incrementWithTtl(
      authRateLimitKey(action, resolveClientIp(request)),
      this.config.rateLimit.authWindowSeconds,
    );

    if (count > limit) {
      throw new ApiException(
        API_ERROR_CODES.TOO_MANY_REQUESTS,
        'Too many attempts. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
