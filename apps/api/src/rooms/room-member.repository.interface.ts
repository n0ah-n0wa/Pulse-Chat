import type { MembershipRole } from '@pulse-chat/shared';

/** Domain representation of a persisted room membership. */
export interface RoomMemberRecord {
  readonly id: string;
  readonly roomId: string;
  readonly userId: string;
  readonly role: MembershipRole;
  readonly joinedAt: Date;
  readonly lastReadMessageId?: string;
  readonly lastReadAt?: Date;
}

export interface CreateRoomMemberRecordInput {
  readonly roomId: string;
  readonly userId: string;
  readonly role: MembershipRole;
}

/** Data-access contract for room memberships. */
export interface RoomMemberRepository {
  create(input: CreateRoomMemberRecordInput): Promise<RoomMemberRecord>;
  findByRoomAndUser(roomId: string, userId: string): Promise<RoomMemberRecord | null>;
  findByRoomId(roomId: string): Promise<RoomMemberRecord[]>;
  findByUserId(userId: string): Promise<RoomMemberRecord[]>;
  findByRoomIds(roomIds: readonly string[]): Promise<RoomMemberRecord[]>;
  updateRole(
    roomId: string,
    userId: string,
    role: MembershipRole,
  ): Promise<RoomMemberRecord | null>;
  updateReadState(
    roomId: string,
    userId: string,
    messageId: string,
  ): Promise<RoomMemberRecord | null>;
  deleteByRoomAndUser(roomId: string, userId: string): Promise<boolean>;
  deleteByRoomId(roomId: string): Promise<void>;
  countByRoomId(roomId: string): Promise<number>;
}
