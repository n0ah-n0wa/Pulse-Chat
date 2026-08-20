import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module.js';
import { AttachmentsModule } from '../attachments/attachments.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { RoomsModule } from '../rooms/rooms.module.js';
import { UsersPersistenceModule } from '../users/users-persistence.module.js';
import { MessageIndexInitializer } from './infrastructure/message-index.initializer.js';
import { MessageReactionDocument, MessageReactionSchema } from './infrastructure/message-reaction.schema.js';
import { MessageDocument, MessageSchema } from './infrastructure/message.schema.js';
import { mongooseMessageReactionRepositoryProviders } from './infrastructure/mongoose-message-reaction.repository.js';
import { mongooseMessageRepositoryProviders } from './infrastructure/mongoose-message.repository.js';
import { MessagesController, RoomMessagesController } from './messages.controller.js';
import { MentionResolverService } from './mention-resolver.service.js';
import { MessagesService } from './messages.service.js';
import { MESSAGE_REPOSITORY } from './messages.tokens.js';
import { RealtimeBroadcastModule } from '../realtime/realtime-broadcast.module.js';

@Module({
  imports: [
    AuthModule,
    RoomsModule,
    NotificationsModule,
    UsersPersistenceModule,
    RealtimeBroadcastModule,
    forwardRef(() => AttachmentsModule),
    MongooseModule.forFeature([
      { name: MessageDocument.name, schema: MessageSchema },
      { name: MessageReactionDocument.name, schema: MessageReactionSchema },
    ]),
  ],
  controllers: [RoomMessagesController, MessagesController],
  providers: [
    MessagesService,
    MentionResolverService,
    MessageIndexInitializer,
    ...mongooseMessageRepositoryProviders,
    ...mongooseMessageReactionRepositoryProviders,
  ],
  exports: [MessagesService, MESSAGE_REPOSITORY],
})
export class MessagesModule {}
