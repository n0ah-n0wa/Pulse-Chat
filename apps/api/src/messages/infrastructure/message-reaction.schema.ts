import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({
  collection: 'message_reactions',
  timestamps: false,
})
export class MessageReactionDocument {
  @Prop({ required: true, type: Types.ObjectId, ref: 'MessageDocument' })
  messageId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'UserDocument' })
  userId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  emoji!: string;

  @Prop({ required: true, default: () => new Date() })
  createdAt!: Date;
}

export type MessageReactionDocumentHydrated = HydratedDocument<MessageReactionDocument>;

export const MessageReactionSchema = SchemaFactory.createForClass(MessageReactionDocument);

MessageReactionSchema.index({ messageId: 1, userId: 1, emoji: 1 }, { unique: true });
MessageReactionSchema.index({ messageId: 1, emoji: 1 });
