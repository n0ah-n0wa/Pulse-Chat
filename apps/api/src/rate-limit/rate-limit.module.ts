import { Global, Module } from '@nestjs/common';

import { RateLimitService } from './rate-limit.service.js';
import { UserRateLimitGuard } from './user-rate-limit.guard.js';

@Global()
@Module({
  providers: [RateLimitService, UserRateLimitGuard],
  exports: [RateLimitService, UserRateLimitGuard],
})
export class RateLimitModule {}
