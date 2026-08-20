import { Global, Module } from '@nestjs/common';

import { redisProviders } from './redis.service.js';

@Global()
@Module({
  providers: [...redisProviders],
  exports: [...redisProviders],
})
export class RedisModule {}
