import { Inject, Injectable } from '@nestjs/common';

import { extractMentionUsernames } from '@pulse-chat/shared';

import type { UserRepository } from '../users/user.repository.interface.js';
import { USER_REPOSITORY } from '../users/users.tokens.js';

/**
 * Parses `@username` tokens from message content and resolves them to user
 * ids through the user repository. Unresolved usernames are silently ignored.
 */
@Injectable()
export class MentionResolverService {
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepository) {}

  async resolveMentionedUserIds(content: string): Promise<readonly string[]> {
    const usernames = extractMentionUsernames(content);
    if (usernames.length === 0) {
      return [];
    }

    const records = await this.users.findByUsernames(usernames);
    return records.map((record) => record.id);
  }
}
