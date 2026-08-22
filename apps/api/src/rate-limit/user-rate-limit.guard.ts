import { HttpStatus, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { API_ERROR_CODES } from '@pulse-chat/shared';

import type { AuthenticatedRequest } from '../auth/types/authenticated-request.types.js';
import { ApiException } from '../common/errors/api.exception.js';
import { RATE_LIMIT_ACTION_KEY } from './rate-limit.decorator.js';
import type { UserRateLimitAction } from './rate-limit.keys.js';
import { RateLimitService } from './rate-limit.service.js';

/** Applies {@link RateLimited} metadata using the authenticated user id. */
@Injectable()
export class UserRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimit: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const action = this.reflector.getAllAndOverride<UserRateLimitAction | undefined>(
      RATE_LIMIT_ACTION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (action === undefined) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.user?.userId;
    if (userId === undefined) {
      throw new ApiException(
        API_ERROR_CODES.UNAUTHORIZED,
        'Authentication required.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    await this.rateLimit.consume(action, userId);
    return true;
  }
}
