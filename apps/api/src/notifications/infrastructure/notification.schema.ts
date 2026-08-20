import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import { NOTIFICATION_TYPES, type NotificationType } from '@pulse-chat/shared';

@Schema({
  collection: 'notifications',
  timestamps: true,
})
export class NotificationDocument {
  @Prop({ required: true, type: Types.ObjectId, ref: 'UserDocument' })
  userId!: Types.ObjectId;

  @Prop({ type: String, required: true, enum: Object.values(NOTIFICATION_TYPES) })
  type!: NotificationType;

  @Prop({ required: true, type: Types.ObjectId })
  referenceId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'UserDocument' })
  actorId!: Types.ObjectId;

  @Prop({ required: true, default: false })
  isRead!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export type NotificationDocumentHydrated = HydratedDocument<NotificationDocument>;

export const NotificationSchema = SchemaFactory.createForClass(NotificationDocument);

// Idempotent: one notification per (recipient, type, reference, actor) tuple.
NotificationSchema.index({ userId: 1, type: 1, referenceId: 1, actorId: 1 }, { unique: true });

// Efficient cursor-paginated listing newest-first.
NotificationSchema.index({ userId: 1, createdAt: -1, _id: -1 });
