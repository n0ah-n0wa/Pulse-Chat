import { ROOM_TYPES, type PublicUserProfile, type RoomResponse } from '@pulse-chat/shared';

export function roomDisplayName(
  room: RoomResponse,
  peer?: Pick<PublicUserProfile, 'displayName' | 'username'>,
): string {
  if (room.type === ROOM_TYPES.DIRECT) {
    const trimmedDisplayName = peer?.displayName?.trim() ?? room.peerDisplayName?.trim();
    if (trimmedDisplayName !== undefined && trimmedDisplayName.length > 0) {
      return trimmedDisplayName;
    }

    const trimmedUsername = peer?.username?.trim() ?? room.peerUsername?.trim();
    if (trimmedUsername !== undefined && trimmedUsername.length > 0) {
      return trimmedUsername;
    }

    if (room.name !== undefined && room.name.trim().length > 0) {
      return room.name;
    }

    return 'Direct message';
  }

  if (room.name !== undefined && room.name.trim().length > 0) {
    return room.name;
  }

  return 'Untitled room';
}

export function roomTypeLabel(room: RoomResponse): string {
  if (room.type === ROOM_TYPES.PUBLIC) {
    return 'Public';
  }

  if (room.type === ROOM_TYPES.PRIVATE) {
    return 'Private';
  }

  return 'Direct';
}

export function findDirectRoomWithPeer(
  rooms: readonly RoomResponse[] | undefined,
  peerUserId: string,
): RoomResponse | undefined {
  return rooms?.find((room) => room.type === ROOM_TYPES.DIRECT && room.peerUserId === peerUserId);
}
