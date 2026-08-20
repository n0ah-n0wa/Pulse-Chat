import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import type {
  CreateRefreshTokenRecordInput,
  RefreshTokenRecord,
  RefreshTokenRepository,
} from '../refresh-token.repository.interface.js';
import { REFRESH_TOKEN_REPOSITORY } from '../refresh-token.repository.interface.js';
import {
  RefreshTokenDocument,
  type RefreshTokenDocumentHydrated,
} from './refresh-token.schema.js';

function objectIdToString(value: Types.ObjectId | string): string {
  return typeof value === 'string' ? value : value.toHexString();
}

function toRefreshTokenRecord(document: RefreshTokenDocumentHydrated): RefreshTokenRecord {
  return {
    jti: document.jti,
    userId: objectIdToString(document.userId),
    familyId: document.familyId,
    tokenHash: document.tokenHash,
    expiresAt: document.expiresAt,
    revokedAt: document.revokedAt,
  };
}

@Injectable()
export class MongooseRefreshTokenRepository implements RefreshTokenRepository {
  constructor(
    @InjectModel(RefreshTokenDocument.name)
    private readonly refreshTokenModel: Model<RefreshTokenDocument>,
  ) {}

  async create(input: CreateRefreshTokenRecordInput): Promise<RefreshTokenRecord> {
    const document = await this.refreshTokenModel.create({
      jti: input.jti,
      userId: new Types.ObjectId(input.userId),
      familyId: input.familyId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
    });

    return toRefreshTokenRecord(document);
  }

  async findByJti(jti: string): Promise<RefreshTokenRecord | null> {
    const document = await this.refreshTokenModel.findOne({ jti }).exec();
    return document ? toRefreshTokenRecord(document) : null;
  }

  async claimActiveByJti(jti: string, revokedAt = new Date()): Promise<RefreshTokenRecord | null> {
    const document = await this.refreshTokenModel
      .findOneAndUpdate(
        {
          jti,
          revokedAt: { $exists: false },
          expiresAt: { $gt: new Date() },
        },
        { $set: { revokedAt } },
        { new: false },
      )
      .exec();

    return document ? toRefreshTokenRecord(document) : null;
  }

  async revokeByJti(jti: string, revokedAt = new Date()): Promise<void> {
    await this.refreshTokenModel.updateOne({ jti }, { $set: { revokedAt } }).exec();
  }

  async revokeFamily(familyId: string, revokedAt = new Date()): Promise<void> {
    await this.refreshTokenModel
      .updateMany({ familyId, revokedAt: { $exists: false } }, { $set: { revokedAt } })
      .exec();
  }
}

export const mongooseRefreshTokenRepositoryProviders = [
  MongooseRefreshTokenRepository,
  {
    provide: REFRESH_TOKEN_REPOSITORY,
    useExisting: MongooseRefreshTokenRepository,
  },
] as const;
