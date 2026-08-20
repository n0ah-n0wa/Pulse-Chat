import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module.js';
import { StorageModule } from '../infrastructure/storage/storage.module.js';
import { MessagesModule } from '../messages/messages.module.js';
import { RoomsModule } from '../rooms/rooms.module.js';
import {
  AttachmentsController,
  FilesController,
  RoomAttachmentsController,
} from './attachments.controller.js';
import { AttachmentsService } from './attachments.service.js';
import { AttachmentIndexInitializer } from './infrastructure/attachment-index.initializer.js';
import { AttachmentDocument, AttachmentSchema } from './infrastructure/attachment.schema.js';
import { mongooseAttachmentRepositoryProviders } from './infrastructure/mongoose-attachment.repository.js';

@Module({
  imports: [
    AuthModule,
    RoomsModule,
    StorageModule,
    forwardRef(() => MessagesModule),
    MongooseModule.forFeature([{ name: AttachmentDocument.name, schema: AttachmentSchema }]),
  ],
  controllers: [RoomAttachmentsController, AttachmentsController, FilesController],
  providers: [
    AttachmentsService,
    AttachmentIndexInitializer,
    ...mongooseAttachmentRepositoryProviders,
  ],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
