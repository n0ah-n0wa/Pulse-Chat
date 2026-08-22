import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { USER_ROLES, type CreateUserInput } from '@pulse-chat/shared';

import { isValidObjectId } from '../../common/validation/is-valid-object-id.js';
import type {
  UpdateUserProfileData,
  UserRecord,
  UserRepository,
} from '../user.repository.interface.js';
import { USER_REPOSITORY } from '../users.tokens.js';
import { UserDocument } from './user.schema.js';

function toUserRecord(
  document: {
    readonly _id: Types.ObjectId;
    readonly username: string;
    readonly email: string;
    readonly passwordHash?: string;
    readonly displayName: string;
    readonly avatarUrl?: string;
    readonly bio?: string;
    readonly role: UserRecord['role'];
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly lastSeenAt?: Date;
  },
  passwordHash?: string,
): UserRecord {
  return {
    id: document._id.toHexString(),
    username: document.username,
    email: document.email,
    passwordHash: passwordHash ?? document.passwordHash,
    displayName: document.displayName,
    avatarUrl: document.avatarUrl,
    bio: document.bio,
    role: document.role,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    lastSeenAt: document.lastSeenAt,
  };
}

@Injectable()
export class MongooseUserRepository implements UserRepository {
  constructor(@InjectModel(UserDocument.name) private readonly userModel: Model<UserDocument>) {}

  async findById(id: string): Promise<UserRecord | null> {
    const document = await this.userModel.findById(id).lean().exec();
    return document ? toUserRecord(document) : null;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const document = await this.userModel
      .findOne({ email: email.toLowerCase() })
      .select('+passwordHash')
      .lean()
      .exec();

    return document ? toUserRecord(document) : null;
  }

  async findByUsername(username: string): Promise<UserRecord | null> {
    const document = await this.userModel.findOne({ username }).lean().exec();

    return document ? toUserRecord(document) : null;
  }

  async findByUsernames(usernames: readonly string[]): Promise<UserRecord[]> {
    if (usernames.length === 0) {
      return [];
    }

    const documents = await this.userModel
      .find({ username: { $in: [...usernames] } })
      .lean()
      .exec();

    return documents.map((document) => toUserRecord(document));
  }

  async findByIds(ids: readonly string[]): Promise<UserRecord[]> {
    const validIds = ids.filter((id) => isValidObjectId(id)).map((id) => new Types.ObjectId(id));
    if (validIds.length === 0) {
      return [];
    }

    const documents = await this.userModel
      .find({ _id: { $in: validIds } })
      .lean()
      .exec();
    return documents.map((document) => toUserRecord(document));
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    const document = await this.userModel.create({
      username: input.username,
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
      bio: input.bio,
      role: input.role ?? USER_ROLES.USER,
    });

    return toUserRecord(document, input.passwordHash);
  }

  async updateProfile(id: string, update: UpdateUserProfileData): Promise<UserRecord | null> {
    const document = await this.userModel
      .findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true })
      .exec();

    return document ? toUserRecord(document) : null;
  }

  async updateLastSeenAt(id: string, lastSeenAt: Date): Promise<UserRecord | null> {
    const document = await this.userModel
      .findByIdAndUpdate(id, { $set: { lastSeenAt } }, { new: true })
      .exec();

    return document ? toUserRecord(document) : null;
  }
}

export const mongooseUserRepositoryProviders = [
  MongooseUserRepository,
  {
    provide: USER_REPOSITORY,
    useExisting: MongooseUserRepository,
  },
] as const;
