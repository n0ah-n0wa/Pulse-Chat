import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { RateLimitService } from '../../rate-limit/rate-limit.service.js';
import { resolveAuthRateLimitAction } from '../utils/auth-rate-limit.js';
import { resolveClientIp } from '../utils/client-ip.js';

/** Redis-backed per-IP limits for unauthenticated auth routes. */
@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimit: RateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const action = resolveAuthRateLimitAction(request.path);

    if (action === undefined) {
      return true;
    }

    await this.rateLimit.consume(action, resolveClientIp(request));
    return true;
  }
}
