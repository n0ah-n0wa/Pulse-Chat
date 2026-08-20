import type { MembershipRole, RoomMemberResponse, RoomResponse } from '@pulse-chat/shared';

import type { RoomMemberRecord } from './room-member.repository.interface.js';
import type { RoomRecord } from './room.repository.interface.js';

function toIsoString(value: Date | undefined): string | undefined {
  return value?.toISOString();
}

/** Maps a persisted room to the public API shape. */
export function toRoomResponse(room: RoomRecord, currentUserRole?: MembershipRole): RoomResponse {
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
    ...(currentUserRole !== undefined ? { currentUserRole } : {}),
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
