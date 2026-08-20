import { describe, expect, it } from 'vitest';

import { MEMBERSHIP_ROLES } from '@pulse-chat/shared';

import { canDeleteMessage, canEditMessage } from './message-permissions.js';

const AUTHOR_ID = '507f1f77bcf86cd799439011';
const OTHER_ID = '507f1f77bcf86cd799439012';

describe('message permissions', () => {
  const owner = { role: MEMBERSHIP_ROLES.OWNER };
  const moderator = { role: MEMBERSHIP_ROLES.MODERATOR };
  const member = { role: MEMBERSHIP_ROLES.MEMBER };

  it('lets authors edit and delete their own messages', () => {
    expect(canEditMessage(AUTHOR_ID, AUTHOR_ID, member)).toBe(true);
    expect(canDeleteMessage(AUTHOR_ID, AUTHOR_ID, member)).toBe(true);
  });

  it('lets moderators and owners manage other members\' messages', () => {
    expect(canEditMessage(OTHER_ID, AUTHOR_ID, moderator)).toBe(true);
    expect(canDeleteMessage(OTHER_ID, AUTHOR_ID, moderator)).toBe(true);
    expect(canEditMessage(OTHER_ID, AUTHOR_ID, owner)).toBe(true);
    expect(canDeleteMessage(OTHER_ID, AUTHOR_ID, owner)).toBe(true);
  });

  it('forbids members from managing someone else\'s messages', () => {
    expect(canEditMessage(OTHER_ID, AUTHOR_ID, member)).toBe(false);
    expect(canDeleteMessage(OTHER_ID, AUTHOR_ID, member)).toBe(false);
    expect(canEditMessage(OTHER_ID, AUTHOR_ID, null)).toBe(false);
  });
});
