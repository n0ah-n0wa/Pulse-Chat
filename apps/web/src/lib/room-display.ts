import { ROOM_TYPES, type RoomResponse } from '@pulse-chat/shared';

export function roomDisplayName(room: RoomResponse): string {
  if (room.name !== undefined && room.name.trim().length > 0) {
    return room.name;
  }

  if (room.type === ROOM_TYPES.DIRECT) {
    return 'Direct message';
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
