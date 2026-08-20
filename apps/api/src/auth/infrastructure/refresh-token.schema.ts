import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({
  collection: 'refresh_tokens',
  timestamps: { createdAt: true, updatedAt: false },
})
export class RefreshTokenDocument {
  @Prop({ required: true, unique: true, index: true })
  jti!: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'UserDocument', index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, index: true })
  familyId!: string;

  @Prop({ required: true, unique: true })
  tokenHash!: string;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop()
  revokedAt?: Date;

  createdAt!: Date;
}

export type RefreshTokenDocumentHydrated = HydratedDocument<RefreshTokenDocument>;

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshTokenDocument);

RefreshTokenSchema.index({ userId: 1, familyId: 1 });
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
