import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { USER_ROLES, type UserRole } from '@pulse-chat/shared';

@Schema({
  collection: 'users',
  timestamps: true,
})
export class UserDocument {
  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  email!: string;

  @Prop({
    required: true,
    unique: true,
    trim: true,
    index: true,
  })
  username!: string;

  @Prop({
    required: true,
    select: false,
  })
  passwordHash!: string;

  @Prop({ required: true, trim: true })
  displayName!: string;

  @Prop()
  avatarUrl?: string;

  @Prop()
  bio?: string;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(USER_ROLES),
    default: USER_ROLES.USER,
  })
  role!: UserRole;

  @Prop()
  lastSeenAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export type UserDocumentHydrated = HydratedDocument<UserDocument>;

export const UserSchema = SchemaFactory.createForClass(UserDocument);
