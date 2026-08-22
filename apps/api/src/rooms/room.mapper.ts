import type { RoomMemberResponse, RoomResponse } from '@pulse-chat/shared';

import type { RoomMemberRecord } from './room-member.repository.interface.js';
import type { RoomRecord } from './room.repository.interface.js';

function toIsoString(value: Date | undefined): string | undefined {
  return value?.toISOString();
}

/** Maps a persisted room to the public API shape. */
export function toRoomResponse(
  room: RoomRecord,
  membership?: Pick<RoomMemberRecord, 'role' | 'lastReadMessageId' | 'lastReadAt'>,
): RoomResponse {
  return {
    id: room.id,
    ...(room.name !== undefined && room.name.length > 0 ? { name: room.name } : {}),
    ...(room.description !== undefined && room.description.length > 0
      ? { description: room.description }
      : {}),
    type: room.type,
    ...(room.ownerId !== undefined ? { ownerId: room.ownerId } : {}),
    createdAt: room.createdAt.toISOString(),
    updatedAt: room.updatedAt.toISOString(),
    ...(membership?.role !== undefined ? { currentUserRole: membership.role } : {}),
    ...(membership?.lastReadMessageId !== undefined
      ? { lastReadMessageId: membership.lastReadMessageId }
      : {}),
    ...(membership?.lastReadAt !== undefined
      ? { lastReadAt: membership.lastReadAt.toISOString() }
      : {}),
  };
}

/** Maps a persisted membership to the public API shape. */
export function toRoomMemberResponse(member: RoomMemberRecord): RoomMemberResponse {
  return {
    id: member.id,
    roomId: member.roomId,
    userId: member.userId,
    role: member.role,
    joinedAt: member.joinedAt.toISOString(),
    lastReadMessageId: member.lastReadMessageId,
    lastReadAt: toIsoString(member.lastReadAt),
  };
}
