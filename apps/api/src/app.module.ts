import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';

import { AuthModule } from './auth/auth.module.js';
import { AppConfigModule } from './config/index.js';
import { InfrastructureModule } from './infrastructure/infrastructure.module.js';
import { RequestIdMiddleware } from './infrastructure/logging/request-id.middleware.js';
import { MessagesModule } from './messages/messages.module.js';
import { AttachmentsModule } from './attachments/attachments.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { RoomsModule } from './rooms/rooms.module.js';
import { UsersModule } from './users/users.module.js';

/**
 * Root module. Feature modules (auth, users, rooms, messages, realtime, ...)
 * are registered here as they are implemented.
 */
@Module({
  imports: [
    AppConfigModule,
    InfrastructureModule,
    AuthModule,
    UsersModule,
    RoomsModule,
    MessagesModule,
    AttachmentsModule,
    NotificationsModule,
    RealtimeModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
