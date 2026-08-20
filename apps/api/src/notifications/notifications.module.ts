import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module.js';
import { RealtimeBroadcastModule } from '../realtime/realtime-broadcast.module.js';
import { NotificationIndexInitializer } from './infrastructure/notification-index.initializer.js';
import { NotificationDocument, NotificationSchema } from './infrastructure/notification.schema.js';
import { mongooseNotificationRepositoryProviders } from './infrastructure/mongoose-notification.repository.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

@Module({
  imports: [
    AuthModule,
    RealtimeBroadcastModule,
    MongooseModule.forFeature([{ name: NotificationDocument.name, schema: NotificationSchema }]),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationIndexInitializer,
    ...mongooseNotificationRepositoryProviders,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
