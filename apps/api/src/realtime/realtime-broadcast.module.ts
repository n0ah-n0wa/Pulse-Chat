import { Module } from '@nestjs/common';

import { RedisRealtimeEventBus } from './bus/redis-realtime-event-bus.js';
import { REALTIME_EVENT_PUBLISHER, REALTIME_EVENT_SUBSCRIBER } from './bus/realtime-bus.tokens.js';
import { RealtimeMessageBroadcastService } from './realtime-message-broadcast.service.js';

@Module({
  providers: [
    RedisRealtimeEventBus,
    {
      provide: REALTIME_EVENT_PUBLISHER,
      useExisting: RedisRealtimeEventBus,
    },
    {
      provide: REALTIME_EVENT_SUBSCRIBER,
      useExisting: RedisRealtimeEventBus,
    },
    RealtimeMessageBroadcastService,
  ],
  exports: [RealtimeMessageBroadcastService, REALTIME_EVENT_PUBLISHER, REALTIME_EVENT_SUBSCRIBER],
})
export class RealtimeBroadcastModule {}
