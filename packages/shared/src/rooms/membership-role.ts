/** Room-level membership role (specification section 9). */
export const MEMBERSHIP_ROLES = {
  OWNER: 'OWNER',
  MODERATOR: 'MODERATOR',
  MEMBER: 'MEMBER',
} as const;

export type MembershipRole = (typeof MEMBERSHIP_ROLES)[keyof typeof MEMBERSHIP_ROLES];

const MEMBERSHIP_ROLE_RANK: Record<MembershipRole, number> = {
  MEMBER: 0,
  MODERATOR: 1,
  OWNER: 2,
};

/** Returns true when `actual` is at least as privileged as `required`. */
export function hasAtLeastMembershipRole(
  actual: MembershipRole,
  required: MembershipRole,
): boolean {
  return (
    MEMBERSHIP_ROLE_RANK[actual] !== undefined &&
    MEMBERSHIP_ROLE_RANK[actual] >= MEMBERSHIP_ROLE_RANK[required]
  );
}
