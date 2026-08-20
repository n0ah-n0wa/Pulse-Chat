import { describe, expect, it } from 'vitest';

import { MEMBERSHIP_ROLES, hasAtLeastMembershipRole } from './membership-role.js';

describe('hasAtLeastMembershipRole', () => {
  it('ranks owner above moderator above member', () => {
    expect(hasAtLeastMembershipRole(MEMBERSHIP_ROLES.OWNER, MEMBERSHIP_ROLES.MODERATOR)).toBe(
      true,
    );
    expect(hasAtLeastMembershipRole(MEMBERSHIP_ROLES.MODERATOR, MEMBERSHIP_ROLES.MEMBER)).toBe(
      true,
    );
    expect(hasAtLeastMembershipRole(MEMBERSHIP_ROLES.MEMBER, MEMBERSHIP_ROLES.MODERATOR)).toBe(
      false,
    );
  });
});
