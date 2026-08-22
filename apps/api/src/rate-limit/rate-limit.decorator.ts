import { SetMetadata } from '@nestjs/common';

import type { UserRateLimitAction } from './rate-limit.keys.js';

export const RATE_LIMIT_ACTION_KEY = 'pulse:rateLimitAction';

/** Marks an authenticated HTTP handler for per-user Redis rate limiting. */
export const RateLimited = (action: UserRateLimitAction) =>
  SetMetadata(RATE_LIMIT_ACTION_KEY, action);
