import {
  MEMBERSHIP_ROLES,
  ROOM_TYPES,
  hasAtLeastMembershipRole,
  normalizeDirectoryQuery,
  type PublicUserProfile,
  type RoomResponse,
} from '@pulse-chat/shared';

import { roomDisplayName, roomTypeLabel } from './room-display';

export function canInviteToRoom(room: RoomResponse): boolean {
  if (room.type === ROOM_TYPES.DIRECT || room.currentUserRole === undefined) {
    return false;
  }

  return hasAtLeastMembershipRole(room.currentUserRole, MEMBERSHIP_ROLES.MODERATOR);
}

export function roomMatchesQuery(
  room: RoomResponse,
  query: string,
  peer?: Pick<PublicUserProfile, 'displayName' | 'username'>,
): boolean {
  const normalized = normalizeDirectoryQuery(query).toLowerCase();
  if (normalized.length === 0) {
    return true;
  }

  const haystack = [
    room.name,
    room.description,
    roomTypeLabel(room),
    roomDisplayName(room, peer),
    peer?.username,
    peer?.displayName,
    room.peerUsername,
    room.peerDisplayName,
  ];

  return haystack.some((part) => part?.toLowerCase().includes(normalized) === true);
}
