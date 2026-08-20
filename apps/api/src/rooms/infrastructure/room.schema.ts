import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import { ROOM_TYPES, type RoomType } from '@pulse-chat/shared';

@Schema({
  collection: 'rooms',
  timestamps: true,
})
export class RoomDocument {
  @Prop({ trim: true })
  name?: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(ROOM_TYPES),
    index: true,
  })
  type!: RoomType;

  @Prop({ type: Types.ObjectId, ref: 'UserDocument', index: true })
  ownerId?: Types.ObjectId;

  @Prop({ unique: true, sparse: true, index: true })
  directKey?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export type RoomDocumentHydrated = HydratedDocument<RoomDocument>;

export const RoomSchema = SchemaFactory.createForClass(RoomDocument);
