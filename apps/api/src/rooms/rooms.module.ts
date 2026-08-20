import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { UsersPersistenceModule } from '../users/users-persistence.module.js';
import { mongooseRoomMemberRepositoryProviders } from './infrastructure/mongoose-room-member.repository.js';
import { mongooseRoomRepositoryProviders } from './infrastructure/mongoose-room.repository.js';
import { RoomIndexInitializer } from './infrastructure/room-index.initializer.js';
import { RoomMemberDocument, RoomMemberSchema } from './infrastructure/room-member.schema.js';
import { RoomDocument, RoomSchema } from './infrastructure/room.schema.js';
import { RoomsController } from './rooms.controller.js';
import { RoomsService } from './rooms.service.js';

@Module({
  imports: [
    UsersPersistenceModule,
    AuthModule,
    NotificationsModule,
    MongooseModule.forFeature([
      { name: RoomDocument.name, schema: RoomSchema },
      { name: RoomMemberDocument.name, schema: RoomMemberSchema },
    ]),
  ],
  controllers: [RoomsController],
  providers: [
    RoomsService,
    RoomIndexInitializer,
    ...mongooseRoomRepositoryProviders,
    ...mongooseRoomMemberRepositoryProviders,
  ],
  exports: [RoomsService],
})
export class RoomsModule {}
