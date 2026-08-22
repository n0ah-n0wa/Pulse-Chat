import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';

import {
  MEMBERSHIP_ROLES,
  MESSAGE_ERROR_CODES,
  ROOM_ERROR_CODES,
  ROOM_TYPES,
  USER_ERROR_CODES,
  type AddRoomMemberInput,
  type CreateRoomInput,
  type MarkRoomReadInput,
  type MembershipRole,
  type RoomMemberResponse,
  type RoomResponse,
  type UpdateRoomInput,
} from '@pulse-chat/shared';

import { ApiException } from '../common/errors/api.exception.js';
import { isValidObjectId } from '../common/validation/is-valid-object-id.js';
import type { MessageRepository } from '../messages/message.repository.interface.js';
import { MESSAGE_REPOSITORY } from '../messages/messages.tokens.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RealtimeMessageBroadcastService } from '../realtime/realtime-message-broadcast.service.js';
import type { UserRecord, UserRepository } from '../users/user.repository.interface.js';
import { USER_REPOSITORY } from '../users/users.tokens.js';
import type { RoomMemberRecord, RoomMemberRepository } from './room-member.repository.interface.js';
import {
  canAssignModerator,
  canDeleteRoom,
  canJoinRoom,
  canManageMembers,
  canRemoveMember,
  canTransferOwnership,
  canUpdateRoomDescription,
  canUpdateRoomName,
  canViewRoom,
} from './room-permissions.js';
import type { RoomRecord, RoomRepository } from './room.repository.interface.js';
import { toRoomMemberResponse, toRoomResponse, type RoomPeerPreview } from './room.mapper.js';
import { ROOM_MEMBER_REPOSITORY, ROOM_REPOSITORY } from './rooms.tokens.js';
import { buildDirectKey } from './utils/direct-key.js';

@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);

  constructor(
    @Inject(ROOM_REPOSITORY) private readonly rooms: RoomRepository,
    @Inject(ROOM_MEMBER_REPOSITORY) private readonly members: RoomMemberRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(MESSAGE_REPOSITORY) private readonly messages: MessageRepository,
    private readonly notificationsService: NotificationsService,
    private readonly realtimeBroadcast: RealtimeMessageBroadcastService,
  ) {}

  async listRooms(userId: string): Promise<RoomResponse[]> {
    const memberships = await this.members.findByUserId(userId);
    const membershipByRoomId = new Map(memberships.map((member) => [member.roomId, member]));

    const [publicRooms, memberRooms] = await Promise.all([
      this.rooms.findPublic(),
      this.rooms.findByIds([...membershipByRoomId.keys()]),
    ]);

    const roomsById = new Map<string, RoomRecord>();
    for (const room of [...publicRooms, ...memberRooms]) {
      roomsById.set(room.id, room);
    }

    const listedRooms = [...roomsById.values()];
    const peerUserIdByRoomId = await this.peerUserIdsByRoomId(userId, listedRooms);
    const peerPreviews = await this.peerPreviewsById([...new Set(peerUserIdByRoomId.values())]);

    return listedRooms
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
      .map((room) => {
        const peerUserId = peerUserIdByRoomId.get(room.id);
        return toRoomResponse(
          room,
          membershipByRoomId.get(room.id),
          peerUserId,
          peerUserId === undefined ? undefined : peerPreviews.get(peerUserId),
        );
      });
  }

  async createRoom(userId: string, input: CreateRoomInput): Promise<RoomResponse> {
    if (input.type === ROOM_TYPES.DIRECT) {
      return this.createDirectRoom(userId, input);
    }

    const room = await this.rooms.create({
      type: input.type,
      name: input.name,
      description: input.description,
      ownerId: userId,
    });

    const membership = await this.members.create({
      roomId: room.id,
      userId,
      role: MEMBERSHIP_ROLES.OWNER,
    });

    return toRoomResponse(room, membership);
  }

  async getRoom(userId: string, roomId: string): Promise<RoomResponse> {
    const { room, membership } = await this.loadAccessibleRoom(userId, roomId);
    const peerUserId =
      room.type === ROOM_TYPES.DIRECT ? await this.getDirectRoomPeer(room.id, userId) : undefined;
    const peer =
      peerUserId === undefined ? undefined : ((await this.users.findById(peerUserId)) ?? undefined);
    return toRoomResponse(room, membership ?? undefined, peerUserId, peer);
  }

  async updateRoom(userId: string, roomId: string, input: UpdateRoomInput): Promise<RoomResponse> {
    const { room, membership } = await this.loadMemberRoom(userId, roomId);

    if (room.type === ROOM_TYPES.DIRECT) {
      throw new ApiException(
        ROOM_ERROR_CODES.INVALID_ROOM_OPERATION,
        'Direct rooms cannot be updated.',
        HttpStatus.FORBIDDEN,
      );
    }

    if (input.name !== undefined && !canUpdateRoomName(membership)) {
      this.throwInsufficientRole();
    }

    if (input.description !== undefined && !canUpdateRoomDescription(membership)) {
      this.throwInsufficientRole();
    }

    if (input.ownerId !== undefined) {
      await this.transferOwnership(room, membership, userId, input.ownerId);
    }

    const updated =
      input.name === undefined && input.description === undefined
        ? await this.rooms.findById(room.id)
        : await this.rooms.update(room.id, {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
          });

    if (updated === null) {
      throw this.roomNotFound();
    }

    const currentMembership = await this.members.findByRoomAndUser(room.id, userId);
    return toRoomResponse(updated, currentMembership ?? undefined);
  }

  async deleteRoom(userId: string, roomId: string): Promise<void> {
    const { room, membership } = await this.loadMemberRoom(userId, roomId);

    if (!canDeleteRoom(room, membership)) {
      this.throwInsufficientRole();
    }

    const occupants = await this.members.findByRoomId(room.id);
    await this.members.deleteByRoomId(room.id);
    await this.rooms.deleteById(room.id);
    await Promise.all(
      occupants.map((occupant) => this.evictMemberFromRealtime(room.id, occupant.userId)),
    );
  }

  async joinRoom(userId: string, roomId: string): Promise<RoomMemberResponse> {
    const room = await this.requireRoom(roomId);
    const existing = await this.members.findByRoomAndUser(room.id, userId);

    if (existing !== null) {
      throw new ApiException(
        ROOM_ERROR_CODES.ALREADY_A_MEMBER,
        'You are already a member of this room.',
        HttpStatus.CONFLICT,
      );
    }

    if (!canJoinRoom(room, existing)) {
      throw new ApiException(
        ROOM_ERROR_CODES.CANNOT_JOIN_ROOM,
        'You cannot join this room.',
        HttpStatus.FORBIDDEN,
      );
    }

    const membership = await this.createMembership(room.id, userId, MEMBERSHIP_ROLES.MEMBER);
    return toRoomMemberResponse(membership);
  }

  async leaveRoom(userId: string, roomId: string): Promise<void> {
    const { room, membership } = await this.loadMemberRoom(userId, roomId);

    if (room.type === ROOM_TYPES.DIRECT) {
      const peerUserId = await this.getDirectRoomPeer(room.id, userId);
      await this.members.deleteByRoomId(room.id);
      await this.rooms.deleteById(room.id);
      await this.evictMemberFromRealtime(room.id, userId);
      if (peerUserId !== undefined) {
        await this.evictMemberFromRealtime(room.id, peerUserId);
      }
      return;
    }

    if (membership.role === MEMBERSHIP_ROLES.OWNER) {
      const memberCount = await this.members.countByRoomId(room.id);
      if (memberCount > 1) {
        throw new ApiException(
          ROOM_ERROR_CODES.OWNER_CANNOT_LEAVE,
          'Transfer ownership before leaving the room.',
          HttpStatus.CONFLICT,
        );
      }

      await this.members.deleteByRoomId(room.id);
      await this.rooms.deleteById(room.id);
      await this.evictMemberFromRealtime(room.id, userId);
      return;
    }

    await this.members.deleteByRoomAndUser(room.id, userId);
    await this.evictMemberFromRealtime(room.id, userId);
  }

  async listMembers(userId: string, roomId: string): Promise<RoomMemberResponse[]> {
    const { room } = await this.loadMemberRoom(userId, roomId);
    const members = await this.members.findByRoomId(room.id);
    return members.map((member) => toRoomMemberResponse(member));
  }

  async markRoomRead(
    userId: string,
    roomId: string,
    input: MarkRoomReadInput,
  ): Promise<RoomMemberResponse> {
    await this.loadMemberRoom(userId, roomId);
    const message = await this.messages.findById(input.messageId);
    if (message === null) {
      throw new ApiException(
        MESSAGE_ERROR_CODES.MESSAGE_NOT_FOUND,
        'Message not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    if (message.roomId !== roomId) {
      throw new ApiException(
        ROOM_ERROR_CODES.INVALID_ROOM_OPERATION,
        'Read cursor must reference a message in this room.',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (message.deletedAt !== undefined) {
      throw new ApiException(
        ROOM_ERROR_CODES.INVALID_ROOM_OPERATION,
        'Read cursor cannot reference a deleted message.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const updated = await this.members.updateReadState(roomId, userId, input.messageId);

    if (updated === null) {
      throw new ApiException(
        ROOM_ERROR_CODES.MEMBER_NOT_FOUND,
        'Membership not found for this room.',
        HttpStatus.NOT_FOUND,
      );
    }

    return toRoomMemberResponse(updated);
  }

  /** Member user ids for a room, used by notification fan-out. */
  async listMemberUserIds(roomId: string): Promise<readonly string[]> {
    const members = await this.members.findByRoomId(roomId);
    return members.map((member) => member.userId);
  }

  async addMember(
    actorId: string,
    roomId: string,
    input: AddRoomMemberInput,
  ): Promise<RoomMemberResponse> {
    const { room, membership } = await this.loadMemberRoom(actorId, roomId);

    if (!canManageMembers(room, membership)) {
      this.throwInsufficientRole();
    }

    if (input.userId === actorId) {
      throw new ApiException(
        ROOM_ERROR_CODES.INVALID_ROOM_OPERATION,
        'Use join to add yourself to a room.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const role = input.role ?? MEMBERSHIP_ROLES.MEMBER;
    this.rejectOwnerAssignment(role);

    if (role === MEMBERSHIP_ROLES.MODERATOR && !canAssignModerator(membership)) {
      this.throwInsufficientRole();
    }

    await this.requireUser(input.userId);

    const existing = await this.members.findByRoomAndUser(room.id, input.userId);
    if (existing !== null) {
      throw new ApiException(
        ROOM_ERROR_CODES.ALREADY_A_MEMBER,
        'User is already a member of this room.',
        HttpStatus.CONFLICT,
      );
    }

    const created = await this.createMembership(room.id, input.userId, role);

    void this.notificationsService
      .notifyRoomInvitation(actorId, input.userId, room.id)
      .catch((error: unknown) => {
        this.logger.warn(
          `Failed to send room invitation notification: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      });

    return toRoomMemberResponse(created);
  }

  async removeMember(actorId: string, roomId: string, targetUserId: string): Promise<void> {
    const { room, membership } = await this.loadMemberRoom(actorId, roomId);

    if (!canManageMembers(room, membership)) {
      this.throwInsufficientRole();
    }

    if (actorId === targetUserId) {
      throw new ApiException(
        ROOM_ERROR_CODES.INVALID_ROOM_OPERATION,
        'Use leave to remove yourself from a room.',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!isValidObjectId(targetUserId)) {
      throw new ApiException(
        ROOM_ERROR_CODES.MEMBER_NOT_FOUND,
        'Member not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    const target = await this.members.findByRoomAndUser(room.id, targetUserId);
    if (target === null) {
      throw new ApiException(
        ROOM_ERROR_CODES.MEMBER_NOT_FOUND,
        'Member not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    if (target.role === MEMBERSHIP_ROLES.OWNER) {
      throw new ApiException(
        ROOM_ERROR_CODES.CANNOT_REMOVE_OWNER,
        'The room owner cannot be removed.',
        HttpStatus.FORBIDDEN,
      );
    }

    if (!canRemoveMember(membership, target)) {
      this.throwInsufficientRole();
    }

    await this.members.deleteByRoomAndUser(room.id, targetUserId);
    await this.evictMemberFromRealtime(room.id, targetUserId);
  }

  private async createDirectRoom(userId: string, input: CreateRoomInput): Promise<RoomResponse> {
    const peerUserId = input.peerUserId;

    if (peerUserId === undefined) {
      throw new ApiException(
        ROOM_ERROR_CODES.DIRECT_ROOM_REQUIRES_PEER,
        'A peer user is required to create a direct room.',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (peerUserId === userId) {
      throw new ApiException(
        ROOM_ERROR_CODES.DIRECT_ROOM_REQUIRES_TWO_USERS,
        'A direct room must contain exactly two distinct users.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const peer = await this.requireUser(peerUserId);

    const directKey = buildDirectKey(userId, peerUserId);
    const existing = await this.rooms.findByDirectKey(directKey);

    if (existing !== null) {
      throw new ApiException(
        ROOM_ERROR_CODES.DIRECT_ROOM_ALREADY_EXISTS,
        'A direct room with this user already exists.',
        HttpStatus.CONFLICT,
      );
    }

    let room: RoomRecord;
    try {
      room = await this.rooms.create({
        type: ROOM_TYPES.DIRECT,
        name: input.name,
        description: input.description,
        directKey,
      });
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        const raced = await this.rooms.findByDirectKey(directKey);
        if (raced !== null) {
          throw new ApiException(
            ROOM_ERROR_CODES.DIRECT_ROOM_ALREADY_EXISTS,
            'A direct room with this user already exists.',
            HttpStatus.CONFLICT,
          );
        }
      }
      throw error;
    }

    try {
      await this.members.create({
        roomId: room.id,
        userId,
        role: MEMBERSHIP_ROLES.MEMBER,
      });
      await this.members.create({
        roomId: room.id,
        userId: peerUserId,
        role: MEMBERSHIP_ROLES.MEMBER,
      });
    } catch (error) {
      await this.members.deleteByRoomId(room.id);
      await this.rooms.deleteById(room.id);
      throw error;
    }

    const membership = await this.members.findByRoomAndUser(room.id, userId);
    return toRoomResponse(room, membership ?? undefined, peerUserId, peer);
  }

  private async evictMemberFromRealtime(roomId: string, userId: string): Promise<void> {
    await this.realtimeBroadcast.evictMemberFromRoom(roomId, userId);
  }

  private async transferOwnership(
    room: RoomRecord,
    membership: RoomMemberRecord | null,
    actorId: string,
    newOwnerId: string,
  ): Promise<void> {
    if (!canTransferOwnership(membership)) {
      this.throwInsufficientRole();
    }

    if (!isValidObjectId(newOwnerId)) {
      throw new ApiException(
        ROOM_ERROR_CODES.MEMBER_NOT_FOUND,
        'The new owner must already be a member of the room.',
        HttpStatus.NOT_FOUND,
      );
    }

    if (newOwnerId === actorId) {
      return;
    }

    const nextOwner = await this.members.findByRoomAndUser(room.id, newOwnerId);
    if (nextOwner === null) {
      throw new ApiException(
        ROOM_ERROR_CODES.MEMBER_NOT_FOUND,
        'The new owner must already be a member of the room.',
        HttpStatus.NOT_FOUND,
      );
    }

    await this.members.updateRole(room.id, newOwnerId, MEMBERSHIP_ROLES.OWNER);
    await this.members.updateRole(room.id, actorId, MEMBERSHIP_ROLES.MODERATOR);
    await this.rooms.update(room.id, { ownerId: newOwnerId });
  }

  /** Returns the raw room record without membership checks. */
  async getRoomRecord(roomId: string): Promise<RoomRecord> {
    return this.requireRoom(roomId);
  }

  /** For direct rooms: returns the other member's userId, or undefined if not found. */
  async getDirectRoomPeer(roomId: string, actorId: string): Promise<string | undefined> {
    const members = await this.members.findByRoomId(roomId);
    const peer = members.find((member) => member.userId !== actorId);
    return peer?.userId;
  }

  private async peerUserIdsByRoomId(
    actorId: string,
    rooms: readonly RoomRecord[],
  ): Promise<Map<string, string>> {
    const directRoomIds = rooms
      .filter((room) => room.type === ROOM_TYPES.DIRECT)
      .map((room) => room.id);
    if (directRoomIds.length === 0) {
      return new Map();
    }

    const memberships = await this.members.findByRoomIds(directRoomIds);
    const peerByRoomId = new Map<string, string>();
    for (const membership of memberships) {
      if (membership.userId !== actorId) {
        peerByRoomId.set(membership.roomId, membership.userId);
      }
    }

    return peerByRoomId;
  }

  private async peerPreviewsById(
    peerUserIds: readonly string[],
  ): Promise<Map<string, RoomPeerPreview>> {
    if (peerUserIds.length === 0) {
      return new Map();
    }

    const records = await this.users.findByIds(peerUserIds);
    return new Map(records.map((record) => [record.id, record]));
  }

  /**
   * Confirms the actor is a member. Public rooms remain visible without
   * membership, but reading or writing messages always requires it.
   */
  async requireMember(userId: string, roomId: string): Promise<RoomMemberRecord> {
    const { membership } = await this.loadMemberRoom(userId, roomId);
    return membership;
  }

  private async loadMemberRoom(
    userId: string,
    roomId: string,
  ): Promise<{ room: RoomRecord; membership: RoomMemberRecord }> {
    const { room, membership } = await this.loadAccessibleRoom(userId, roomId);

    if (membership === null) {
      throw new ApiException(
        ROOM_ERROR_CODES.NOT_A_MEMBER,
        'You are not a member of this room.',
        HttpStatus.FORBIDDEN,
      );
    }

    return { room, membership };
  }

  private async loadAccessibleRoom(
    userId: string,
    roomId: string,
  ): Promise<{ room: RoomRecord; membership: RoomMemberRecord | null }> {
    const room = await this.requireRoom(roomId);
    const membership = await this.members.findByRoomAndUser(room.id, userId);

    if (!canViewRoom(room, membership)) {
      throw new ApiException(
        ROOM_ERROR_CODES.ROOM_ACCESS_DENIED,
        'You do not have access to this room.',
        HttpStatus.FORBIDDEN,
      );
    }

    return { room, membership };
  }

  private async requireRoom(roomId: string): Promise<RoomRecord> {
    if (!isValidObjectId(roomId)) {
      throw this.roomNotFound();
    }

    const room = await this.rooms.findById(roomId);
    if (room === null) {
      throw this.roomNotFound();
    }

    return room;
  }

  private async requireUser(userId: string): Promise<UserRecord> {
    if (!isValidObjectId(userId)) {
      throw new ApiException(
        USER_ERROR_CODES.USER_NOT_FOUND,
        'User not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    const user = await this.users.findById(userId);
    if (user === null) {
      throw new ApiException(
        USER_ERROR_CODES.USER_NOT_FOUND,
        'User not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    return user;
  }

  private async createMembership(
    roomId: string,
    userId: string,
    role: MembershipRole,
  ): Promise<RoomMemberRecord> {
    try {
      return await this.members.create({ roomId, userId, role });
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ApiException(
          ROOM_ERROR_CODES.ALREADY_A_MEMBER,
          'User is already a member of this room.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  private rejectOwnerAssignment(role: string): void {
    if (role === MEMBERSHIP_ROLES.OWNER) {
      this.throwInsufficientRole();
    }
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
  }

  private roomNotFound(): ApiException {
    return new ApiException(
      ROOM_ERROR_CODES.ROOM_NOT_FOUND,
      'Room not found.',
      HttpStatus.NOT_FOUND,
    );
  }

  private throwInsufficientRole(): never {
    throw new ApiException(
      ROOM_ERROR_CODES.INSUFFICIENT_ROOM_ROLE,
      'You do not have permission to perform this action.',
      HttpStatus.FORBIDDEN,
    );
  }
}
