import { Module } from '@nestjs/common';

import { APP_INSTANCE_ID } from '../config/index.js';
import { RealtimeBroadcastModule } from '../realtime/realtime-broadcast.module.js';
import { RealtimeMessageBroadcastService } from '../realtime/realtime-message-broadcast.service.js';
import { UsersModule } from '../users/users.module.js';
import { RedisPresenceStore } from './infrastructure/redis-presence.store.js';
import { createPresenceOptions, PresenceService } from './presence.service.js';
import { PRESENCE_NOTIFIER, PRESENCE_OPTIONS, PRESENCE_STORE } from './presence.tokens.js';

@Module({
  imports: [UsersModule, RealtimeBroadcastModule],
  providers: [
    PresenceService,
    RedisPresenceStore,
    {
      provide: PRESENCE_STORE,
      useExisting: RedisPresenceStore,
    },
    {
      provide: PRESENCE_NOTIFIER,
      useExisting: RealtimeMessageBroadcastService,
    },
    {
      provide: PRESENCE_OPTIONS,
      inject: [APP_INSTANCE_ID],
      useFactory: (instanceId: string) => createPresenceOptions({ instanceId }),
    },
  ],
  exports: [PresenceService],
})
export class PresenceModule {}
