import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import { MESSAGE_MAX_LENGTH, type AttachmentReference } from '@pulse-chat/shared';

@Schema({
  collection: 'messages',
  timestamps: true,
})
export class MessageDocument {
  @Prop({ required: true, type: Types.ObjectId, ref: 'RoomDocument' })
  roomId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'UserDocument' })
  authorId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: MESSAGE_MAX_LENGTH })
  content!: string;

  @Prop({ required: true, trim: true })
  clientMessageId!: string;

  @Prop({ type: Types.ObjectId, ref: 'MessageDocument' })
  replyToMessageId?: Types.ObjectId;

  @Prop({
    type: [{ id: { type: String, required: true } }],
    default: [],
  })
  attachments!: AttachmentReference[];

  @Prop()
  editedAt?: Date;

  @Prop()
  deletedAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export type MessageDocumentHydrated = HydratedDocument<MessageDocument>;

export const MessageSchema = SchemaFactory.createForClass(MessageDocument);

MessageSchema.index({ roomId: 1, createdAt: -1, _id: -1 });
MessageSchema.index({ authorId: 1, createdAt: -1, _id: -1 });
MessageSchema.index({ roomId: 1, clientMessageId: 1, authorId: 1 }, { unique: true });
MessageSchema.index({ roomId: 1, content: 'text' }, { name: 'message_room_content_text' });
