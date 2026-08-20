import { HttpStatus, Inject, Injectable } from '@nestjs/common';

import {
  USER_ERROR_CODES,
  type CurrentUserProfile,
  type PublicUserProfile,
  type UpdateUserProfileInput,
} from '@pulse-chat/shared';

import { ApiException } from '../common/errors/api.exception.js';
import { isValidObjectId } from '../common/validation/is-valid-object-id.js';
import {
  toCurrentUserProfile,
  toPublicUserProfile,
  toUpdateUserProfileData,
} from './user-profile.mapper.js';
import type { UserRepository } from './user.repository.interface.js';
import { USER_REPOSITORY } from './users.tokens.js';

@Injectable()
export class UsersService {
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepository) {}

  async getPublicProfile(userId: string): Promise<PublicUserProfile> {
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

    return toPublicUserProfile(user);
  }

  async updateCurrentUserProfile(
    userId: string,
    input: UpdateUserProfileInput,
  ): Promise<CurrentUserProfile> {
    const updated = await this.users.updateProfile(userId, toUpdateUserProfileData(input));

    if (updated === null) {
      throw new ApiException(
        USER_ERROR_CODES.USER_NOT_FOUND,
        'User not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    return toCurrentUserProfile(updated);
  }

  async recordLastSeen(userId: string, lastSeenAt: Date): Promise<void> {
    try {
      await this.users.updateLastSeenAt(userId, lastSeenAt);
    } catch {
      // Presence is ephemeral; durable lastSeen is best-effort.
    }
  }
}
