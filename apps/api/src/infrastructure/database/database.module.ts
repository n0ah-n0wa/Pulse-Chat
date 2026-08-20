import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AppConfigModule, AppConfigService } from '../../config/index.js';
import { DATABASE_HEALTH_PROBE } from '../tokens.js';
import { MongooseDatabaseHealthProbe } from './mongoose-database-health-probe.js';
import { MongooseConnectionLifecycle } from './mongoose-connection-lifecycle.js';

@Module({
  imports: [
    AppConfigModule,
    MongooseModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        uri: config.mongodbUri,
      }),
    }),
  ],
  providers: [
    MongooseDatabaseHealthProbe,
    MongooseConnectionLifecycle,
    {
      provide: DATABASE_HEALTH_PROBE,
      useExisting: MongooseDatabaseHealthProbe,
    },
  ],
  exports: [MongooseModule, DATABASE_HEALTH_PROBE],
})
export class DatabaseModule {}
