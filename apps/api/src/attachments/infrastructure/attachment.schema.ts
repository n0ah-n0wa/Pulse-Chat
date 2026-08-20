import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({
  collection: 'attachments',
  timestamps: true,
})
export class AttachmentDocument {
  @Prop({ required: true, type: Types.ObjectId, ref: 'RoomDocument' })
  roomId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'UserDocument' })
  uploaderId!: Types.ObjectId;

  @Prop({ required: true, trim: true, unique: true })
  storageKey!: string;

  @Prop({ required: true, trim: true })
  filename!: string;

  @Prop({ required: true, trim: true })
  mimeType!: string;

  @Prop({ required: true, min: 1 })
  sizeBytes!: number;

  @Prop({ type: Types.ObjectId, ref: 'MessageDocument' })
  messageId?: Types.ObjectId;

  @Prop()
  deletedAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export type AttachmentDocumentHydrated = HydratedDocument<AttachmentDocument>;

export const AttachmentSchema = SchemaFactory.createForClass(AttachmentDocument);

AttachmentSchema.index({ roomId: 1, uploaderId: 1, createdAt: -1 });
AttachmentSchema.index({ messageId: 1 });
