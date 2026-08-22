import { createReadStream } from 'node:fs';
import path from 'node:path';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';

import {
  ATTACHMENT_ERROR_CODES,
  USER_ERROR_CODES,
  usernameSchema,
  type CurrentUserProfile,
  type PublicUserProfile,
  type UpdateUserProfileInput,
} from '@pulse-chat/shared';

import { ApiException } from '../common/errors/api.exception.js';
import { isValidObjectId } from '../common/validation/is-valid-object-id.js';
import { AppConfigService } from '../config/index.js';
import { FileUploadService } from '../infrastructure/storage/file-upload.service.js';
import { assertSafeStorageKey } from '../infrastructure/storage/validation/assert-safe-storage-key.js';
import {
  getStoredAvatarKey,
  toCurrentUserProfile,
  toPublicUserProfile,
  toUpdateUserProfileData,
} from './user-profile.mapper.js';
import type { UserRepository } from './user.repository.interface.js';
import { USER_REPOSITORY } from './users.tokens.js';

const AVATAR_EXTENSION_TO_MIME = {
  jpg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
} as const;

export interface ReadableAvatarFile {
  readonly stream: ReturnType<typeof createReadStream>;
  readonly mimeType: string;
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly fileUploads: FileUploadService,
    private readonly config: AppConfigService,
  ) {}

  async getPublicProfile(userId: string): Promise<PublicUserProfile> {
    if (!isValidObjectId(userId)) {
      throw new ApiException(
        USER_ERROR_CODES.USER_NOT_FOUND,
        'User not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    const user = await this.users.findById(userId);
    return this.requirePublicProfile(user);
  }

  async getPublicProfileByUsername(username: string): Promise<PublicUserProfile> {
    const parsed = usernameSchema.safeParse(username);
    if (!parsed.success) {
      throw new ApiException(
        USER_ERROR_CODES.USER_NOT_FOUND,
        'User not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    const user = await this.users.findByUsername(parsed.data);
    return this.requirePublicProfile(user);
  }

  async updateCurrentUserProfile(
    userId: string,
    input: UpdateUserProfileInput,
  ): Promise<CurrentUserProfile> {
    if (input.username !== undefined) {
      await this.assertUsernameAvailable(userId, input.username);
    }

    let updated;
    try {
      updated = await this.users.updateProfile(userId, toUpdateUserProfileData(input));
    } catch (error) {
      this.rethrowDuplicateUsername(error);
      throw error;
    }

    if (updated === null) {
      throw new ApiException(
        USER_ERROR_CODES.USER_NOT_FOUND,
        'User not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    return toCurrentUserProfile(updated);
  }

  async uploadAvatar(
    userId: string,
    buffer: Buffer,
    declaredFilename?: string,
  ): Promise<CurrentUserProfile> {
    const current = await this.users.findById(userId);
    if (current === null) {
      throw new ApiException(
        USER_ERROR_CODES.USER_NOT_FOUND,
        'User not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    const stored = await this.fileUploads.upload({
      buffer,
      declaredFilename,
    });

    if (
      stored.mimeType !== 'image/jpeg' &&
      stored.mimeType !== 'image/png' &&
      stored.mimeType !== 'image/gif' &&
      stored.mimeType !== 'image/webp'
    ) {
      await this.fileUploads.delete(stored.key);
      throw new ApiException(
        ATTACHMENT_ERROR_CODES.INVALID_FILE_TYPE,
        'Avatar must be a JPEG, PNG, GIF, or WebP image.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const previousKey = getStoredAvatarKey(current);
    const updated = await this.users.updateProfile(userId, { avatarUrl: stored.key });

    if (updated === null) {
      await this.fileUploads.delete(stored.key);
      throw new ApiException(
        USER_ERROR_CODES.USER_NOT_FOUND,
        'User not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    if (previousKey !== undefined) {
      try {
        await this.fileUploads.delete(previousKey);
      } catch {
        // Replacing the profile photo should not fail if the old file is already gone.
      }
    }

    return toCurrentUserProfile(updated);
  }

  async openAvatar(userId: string): Promise<ReadableAvatarFile> {
    if (!isValidObjectId(userId)) {
      throw new ApiException(
        USER_ERROR_CODES.USER_NOT_FOUND,
        'User not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    const user = await this.users.findById(userId);
    if (user === null) {
      throw new ApiException(
        USER_ERROR_CODES.USER_NOT_FOUND,
        'User not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    const storageKey = getStoredAvatarKey(user);
    if (storageKey === undefined) {
      throw new ApiException(
        USER_ERROR_CODES.USER_NOT_FOUND,
        'Avatar not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    assertSafeStorageKey(storageKey);

    if (this.config.fileStorage.provider !== 'local') {
      throw new ApiException(
        ATTACHMENT_ERROR_CODES.FILE_NOT_FOUND,
        'Direct avatar download is not available for this storage provider.',
        HttpStatus.NOT_IMPLEMENTED,
      );
    }

    const storageRoot = this.config.fileStorage.path;
    if (storageRoot === undefined || storageRoot.trim().length === 0) {
      throw new Error('FILE_STORAGE_PATH is required for the local storage provider.');
    }

    const extension = storageKey.split('.').at(-1);
    const mimeType =
      extension !== undefined && extension in AVATAR_EXTENSION_TO_MIME
        ? AVATAR_EXTENSION_TO_MIME[extension as keyof typeof AVATAR_EXTENSION_TO_MIME]
        : undefined;

    if (mimeType === undefined) {
      throw new ApiException(
        ATTACHMENT_ERROR_CODES.INVALID_FILE_TYPE,
        'Avatar file type is not allowed.',
        HttpStatus.BAD_REQUEST,
      );
    }

    return {
      stream: createReadStream(path.join(path.resolve(storageRoot), storageKey)),
      mimeType,
    };
  }

  async recordLastSeen(userId: string, lastSeenAt: Date): Promise<void> {
    try {
      await this.users.updateLastSeenAt(userId, lastSeenAt);
    } catch {
      // Presence is ephemeral; durable lastSeen is best-effort.
    }
  }

  private requirePublicProfile(
    user: Awaited<ReturnType<UserRepository['findById']>>,
  ): PublicUserProfile {
    if (user === null) {
      throw new ApiException(
        USER_ERROR_CODES.USER_NOT_FOUND,
        'User not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    return toPublicUserProfile(user);
  }

  private async assertUsernameAvailable(userId: string, username: string): Promise<void> {
    const existing = await this.users.findByUsername(username);
    if (existing !== null && existing.id !== userId) {
      throw new ApiException(
        USER_ERROR_CODES.USERNAME_ALREADY_TAKEN,
        'This username is already taken.',
        HttpStatus.CONFLICT,
      );
    }
  }

  private rethrowDuplicateUsername(error: unknown): void {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000 &&
      'keyPattern' in error &&
      typeof error.keyPattern === 'object' &&
      error.keyPattern !== null &&
      'username' in error.keyPattern
    ) {
      throw new ApiException(
        USER_ERROR_CODES.USERNAME_ALREADY_TAKEN,
        'This username is already taken.',
        HttpStatus.CONFLICT,
      );
    }
  }
}
