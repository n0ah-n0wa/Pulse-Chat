import type { RoomType } from '@pulse-chat/shared';

/** Domain representation of a persisted room independent of MongoDB. */
export interface RoomRecord {
  readonly id: string;
  readonly name?: string;
  readonly description?: string;
  readonly type: RoomType;
  readonly ownerId?: string;
  readonly directKey?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateRoomRecordInput {
  readonly name?: string;
  readonly description?: string;
  readonly type: RoomType;
  readonly ownerId?: string;
  readonly directKey?: string;
}

export interface UpdateRoomRecordInput {
  readonly name?: string;
  readonly description?: string;
  readonly ownerId?: string | null;
}

/** Data-access contract for rooms. */
export interface RoomRepository {
  create(input: CreateRoomRecordInput): Promise<RoomRecord>;
  findById(id: string): Promise<RoomRecord | null>;
  findByIds(ids: readonly string[]): Promise<RoomRecord[]>;
  findPublic(): Promise<RoomRecord[]>;
  findByDirectKey(directKey: string): Promise<RoomRecord | null>;
  update(id: string, update: UpdateRoomRecordInput): Promise<RoomRecord | null>;
  deleteById(id: string): Promise<void>;
}
