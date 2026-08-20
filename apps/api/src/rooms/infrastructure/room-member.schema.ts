import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import { MEMBERSHIP_ROLES, type MembershipRole } from '@pulse-chat/shared';

@Schema({
  collection: 'room_members',
  timestamps: false,
})
export class RoomMemberDocument {
  @Prop({ required: true, type: Types.ObjectId, ref: 'RoomDocument', index: true })
  roomId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'UserDocument', index: true })
  userId!: Types.ObjectId;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(MEMBERSHIP_ROLES),
  })
  role!: MembershipRole;

  @Prop({ required: true, default: () => new Date() })
  joinedAt!: Date;

  @Prop()
  lastReadMessageId?: string;

  @Prop()
  lastReadAt?: Date;
}

export type RoomMemberDocumentHydrated = HydratedDocument<RoomMemberDocument>;

export const RoomMemberSchema = SchemaFactory.createForClass(RoomMemberDocument);

RoomMemberSchema.index({ roomId: 1, userId: 1 }, { unique: true });
RoomMemberSchema.index({ userId: 1, roomId: 1 });
