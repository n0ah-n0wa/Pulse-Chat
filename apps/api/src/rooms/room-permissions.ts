import {
  MEMBERSHIP_ROLES,
  ROOM_TYPES,
  hasAtLeastMembershipRole,
  type MembershipRole,
  type RoomType,
} from '@pulse-chat/shared';

/** Minimum facts needed to decide whether a room is visible. */
export interface RoomAccessTarget {
  readonly type: RoomType;
}

/** Minimum facts needed to decide membership-gated actions. */
export interface MembershipAccess {
  readonly role: MembershipRole;
}

export function canViewRoom(room: RoomAccessTarget, membership: MembershipAccess | null): boolean {
  if (room.type === ROOM_TYPES.PUBLIC) {
    return true;
  }

  return membership !== null;
}

export function canJoinRoom(room: RoomAccessTarget, membership: MembershipAccess | null): boolean {
  return room.type === ROOM_TYPES.PUBLIC && membership === null;
}

export function canUpdateRoomName(membership: MembershipAccess | null): boolean {
  return membership?.role === MEMBERSHIP_ROLES.OWNER;
}

export function canUpdateRoomDescription(membership: MembershipAccess | null): boolean {
  return membership !== null && hasAtLeastMembershipRole(membership.role, MEMBERSHIP_ROLES.MODERATOR);
}

export function canTransferOwnership(membership: MembershipAccess | null): boolean {
  return membership?.role === MEMBERSHIP_ROLES.OWNER;
}

export function canDeleteRoom(room: RoomAccessTarget, membership: MembershipAccess | null): boolean {
  if (membership === null) {
    return false;
  }

  if (room.type === ROOM_TYPES.DIRECT) {
    return true;
  }

  return membership.role === MEMBERSHIP_ROLES.OWNER;
}

export function canManageMembers(
  room: RoomAccessTarget,
  membership: MembershipAccess | null,
): boolean {
  return (
    room.type !== ROOM_TYPES.DIRECT &&
    membership !== null &&
    hasAtLeastMembershipRole(membership.role, MEMBERSHIP_ROLES.MODERATOR)
  );
}

export function canAssignModerator(membership: MembershipAccess | null): boolean {
  return membership?.role === MEMBERSHIP_ROLES.OWNER;
}

export function canRemoveMember(
  actor: MembershipAccess | null,
  target: MembershipAccess,
): boolean {
  if (actor === null || target.role === MEMBERSHIP_ROLES.OWNER) {
    return false;
  }

  if (actor.role === MEMBERSHIP_ROLES.OWNER) {
    return true;
  }

  return actor.role === MEMBERSHIP_ROLES.MODERATOR && target.role === MEMBERSHIP_ROLES.MEMBER;
}
