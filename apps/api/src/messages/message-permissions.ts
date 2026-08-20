import { MEMBERSHIP_ROLES, hasAtLeastMembershipRole, type MembershipRole } from '@pulse-chat/shared';

/** Minimum membership facts needed to decide message edit/delete rights. */
export interface MessageActorMembership {
  readonly role: MembershipRole;
}

export function canEditMessage(
  actorId: string,
  authorId: string,
  membership: MessageActorMembership | null,
): boolean {
  if (membership === null) {
    return false;
  }

  if (actorId === authorId) {
    return true;
  }

  return hasAtLeastMembershipRole(membership.role, MEMBERSHIP_ROLES.MODERATOR);
}

export function canDeleteMessage(
  actorId: string,
  authorId: string,
  membership: MessageActorMembership | null,
): boolean {
  return canEditMessage(actorId, authorId, membership);
}
