import { Global, Module } from '@nestjs/common';

import type { AppConfig } from '@pulse-chat/shared';
import { parseAppConfig } from '@pulse-chat/shared';

import { APP_CONFIG, APP_INSTANCE_ID } from './app-config.constants.js';
import { AppConfigService } from './app-config.service.js';
import { createAppInstanceId } from './app-instance-id.js';

@Global()
@Module({
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: (): AppConfig => parseAppConfig(process.env),
    },
    AppConfigService,
    {
      provide: APP_INSTANCE_ID,
      useFactory: createAppInstanceId,
    },
  ],
  exports: [APP_CONFIG, AppConfigService, APP_INSTANCE_ID],
})
export class AppConfigModule {}
