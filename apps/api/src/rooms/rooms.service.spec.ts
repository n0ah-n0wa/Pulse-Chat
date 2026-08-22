import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MEMBERSHIP_ROLES,
  MESSAGE_ERROR_CODES,
  ROOM_ERROR_CODES,
  ROOM_TYPES,
  USER_ERROR_CODES,
} from '@pulse-chat/shared';

import type { MessageRepository } from '../messages/message.repository.interface.js';
import type { UserRepository } from '../users/user.repository.interface.js';
import type { RoomMemberRecord, RoomMemberRepository } from './room-member.repository.interface.js';
import type { RoomRecord, RoomRepository } from './room.repository.interface.js';
import { RoomsService } from './rooms.service.js';

const OWNER_ID = '507f1f77bcf86cd799439011';
const MEMBER_ID = '507f1f77bcf86cd799439012';
const PEER_ID = '507f1f77bcf86cd799439013';
const ROOM_ID = '507f1f77bcf86cd799439021';

function room(overrides: Partial<RoomRecord> = {}): RoomRecord {
  return {
    id: ROOM_ID,
    name: 'General',
    type: ROOM_TYPES.PUBLIC,
    ownerId: OWNER_ID,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function member(overrides: Partial<RoomMemberRecord> = {}): RoomMemberRecord {
  return {
    id: '507f1f77bcf86cd799439031',
    roomId: ROOM_ID,
    userId: OWNER_ID,
    role: MEMBERSHIP_ROLES.OWNER,
    joinedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('RoomsService', () => {
  const createRoom = vi.fn<RoomRepository['create']>();
  const findRoomById = vi.fn<RoomRepository['findById']>();
  const findRoomsByIds = vi.fn<RoomRepository['findByIds']>();
  const findPublic = vi.fn<RoomRepository['findPublic']>();
  const findByDirectKey = vi.fn<RoomRepository['findByDirectKey']>();
  const updateRoom = vi.fn<RoomRepository['update']>();
  const deleteRoomById = vi.fn<RoomRepository['deleteById']>();

  const createMember = vi.fn<RoomMemberRepository['create']>();
  const findByRoomAndUser = vi.fn<RoomMemberRepository['findByRoomAndUser']>();
  const findByRoomId = vi.fn<RoomMemberRepository['findByRoomId']>();
  const findByUserId = vi.fn<RoomMemberRepository['findByUserId']>();
  const updateRole = vi.fn<RoomMemberRepository['updateRole']>();
  const deleteByRoomAndUser = vi.fn<RoomMemberRepository['deleteByRoomAndUser']>();
  const deleteByRoomId = vi.fn<RoomMemberRepository['deleteByRoomId']>();
  const countByRoomId = vi.fn<RoomMemberRepository['countByRoomId']>();
  const updateReadState = vi.fn<RoomMemberRepository['updateReadState']>();

  const findUserById = vi.fn<UserRepository['findById']>();
  const findMessageById = vi.fn<MessageRepository['findById']>();

  const rooms: RoomRepository = {
    create: createRoom,
    findById: findRoomById,
    findByIds: findRoomsByIds,
    findPublic,
    findByDirectKey,
    update: updateRoom,
    deleteById: deleteRoomById,
  };

  const members: RoomMemberRepository = {
    create: createMember,
    findByRoomAndUser,
    findByRoomId,
    findByUserId,
    updateRole,
    deleteByRoomAndUser,
    deleteByRoomId,
    countByRoomId,
    updateReadState,
  };

  const users: UserRepository = {
    findById: findUserById,
    findByEmail: vi.fn(),
    findByUsername: vi.fn(),
    findByUsernames: vi.fn(),
    findByIds: vi.fn(),
    create: vi.fn(),
    updateProfile: vi.fn(),
    updateLastSeenAt: vi.fn(),
  };

  const messages = {
    findById: findMessageById,
  } as unknown as MessageRepository;

  const notificationsService = {
    notifyRoomInvitation: vi.fn().mockResolvedValue(undefined),
  } as unknown as import('../notifications/notifications.service.js').NotificationsService;
  const evictMemberFromRoom = vi.fn().mockResolvedValue(undefined);
  const realtimeBroadcast = {
    evictMemberFromRoom,
  } as unknown as import('../realtime/realtime-message-broadcast.service.js').RealtimeMessageBroadcastService;
  const service = new RoomsService(
    rooms,
    members,
    users,
    messages,
    notificationsService,
    realtimeBroadcast,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides private rooms from users who are not members', async () => {
    findRoomById.mockResolvedValue(room({ type: ROOM_TYPES.PRIVATE }));
    findByRoomAndUser.mockResolvedValue(null);

    await expect(service.getRoom(MEMBER_ID, ROOM_ID)).rejects.toMatchObject({
      code: ROOM_ERROR_CODES.ROOM_ACCESS_DENIED,
    });
  });

  it('lists public rooms plus private rooms the user belongs to', async () => {
    const privateRoom = room({
      id: '507f1f77bcf86cd799439022',
      name: 'Secret',
      type: ROOM_TYPES.PRIVATE,
    });
    findByUserId.mockResolvedValue([member({ roomId: privateRoom.id, userId: MEMBER_ID })]);
    findPublic.mockResolvedValue([room()]);
    findRoomsByIds.mockResolvedValue([privateRoom]);

    const listed = await service.listRooms(MEMBER_ID);

    expect(listed.map((item) => item.id).sort()).toEqual([ROOM_ID, privateRoom.id].sort());
  });

  it('creates a public room with the creator as owner', async () => {
    createRoom.mockResolvedValue(room());
    createMember.mockResolvedValue(member());

    await expect(
      service.createRoom(OWNER_ID, { type: ROOM_TYPES.PUBLIC, name: 'General' }),
    ).resolves.toMatchObject({
      id: ROOM_ID,
      currentUserRole: MEMBERSHIP_ROLES.OWNER,
      ownerId: OWNER_ID,
    });
  });

  it('rejects a member renaming a room', async () => {
    findRoomById.mockResolvedValue(room({ type: ROOM_TYPES.PRIVATE }));
    findByRoomAndUser.mockResolvedValue(
      member({ userId: MEMBER_ID, role: MEMBERSHIP_ROLES.MEMBER }),
    );

    await expect(
      service.updateRoom(MEMBER_ID, ROOM_ID, { name: 'Hijacked' }),
    ).rejects.toMatchObject({
      code: ROOM_ERROR_CODES.INSUFFICIENT_ROOM_ROLE,
    });
  });

  it('lets a moderator update the description but not delete the room', async () => {
    findRoomById.mockResolvedValue(room({ type: ROOM_TYPES.PRIVATE }));
    findByRoomAndUser.mockResolvedValue(
      member({ userId: MEMBER_ID, role: MEMBERSHIP_ROLES.MODERATOR }),
    );
    updateRoom.mockResolvedValue(room({ description: 'Updated' }));

    await expect(
      service.updateRoom(MEMBER_ID, ROOM_ID, { description: 'Updated' }),
    ).resolves.toMatchObject({ description: 'Updated' });

    await expect(service.deleteRoom(MEMBER_ID, ROOM_ID)).rejects.toMatchObject({
      code: ROOM_ERROR_CODES.INSUFFICIENT_ROOM_ROLE,
    });
  });

  it('lets the owner delete a private room', async () => {
    findRoomById.mockResolvedValue(room({ type: ROOM_TYPES.PRIVATE }));
    findByRoomAndUser.mockResolvedValue(member());
    findByRoomId.mockResolvedValue([member()]);

    await service.deleteRoom(OWNER_ID, ROOM_ID);

    expect(deleteByRoomId).toHaveBeenCalledWith(ROOM_ID);
    expect(deleteRoomById).toHaveBeenCalledWith(ROOM_ID);
    expect(evictMemberFromRoom).toHaveBeenCalledWith(ROOM_ID, OWNER_ID);
  });

  it('prevents joining a private room', async () => {
    findRoomById.mockResolvedValue(room({ type: ROOM_TYPES.PRIVATE }));
    findByRoomAndUser.mockResolvedValue(null);

    await expect(service.joinRoom(MEMBER_ID, ROOM_ID)).rejects.toMatchObject({
      code: ROOM_ERROR_CODES.CANNOT_JOIN_ROOM,
    });
  });

  it('prevents the owner from leaving while other members remain', async () => {
    findRoomById.mockResolvedValue(room({ type: ROOM_TYPES.PRIVATE }));
    findByRoomAndUser.mockResolvedValue(member());
    countByRoomId.mockResolvedValue(2);

    await expect(service.leaveRoom(OWNER_ID, ROOM_ID)).rejects.toMatchObject({
      code: ROOM_ERROR_CODES.OWNER_CANNOT_LEAVE,
    });
  });

  it('rejects creating a direct room with oneself', async () => {
    await expect(
      service.createRoom(OWNER_ID, { type: ROOM_TYPES.DIRECT, peerUserId: OWNER_ID }),
    ).rejects.toMatchObject({
      code: ROOM_ERROR_CODES.DIRECT_ROOM_REQUIRES_TWO_USERS,
    });
  });

  it('creates a direct room with exactly two members', async () => {
    findUserById.mockResolvedValue({
      id: PEER_ID,
      username: 'peer',
      email: 'peer@example.com',
      displayName: 'Peer',
      role: 'USER',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    findByDirectKey.mockResolvedValue(null);
    createRoom.mockResolvedValue(
      room({ type: ROOM_TYPES.DIRECT, ownerId: undefined, name: undefined }),
    );
    createMember.mockResolvedValue(member({ role: MEMBERSHIP_ROLES.MEMBER }));

    await expect(
      service.createRoom(OWNER_ID, { type: ROOM_TYPES.DIRECT, peerUserId: PEER_ID }),
    ).resolves.toMatchObject({ type: ROOM_TYPES.DIRECT });

    expect(createMember).toHaveBeenCalledTimes(2);
    expect(createMember).toHaveBeenCalledWith({
      roomId: ROOM_ID,
      userId: OWNER_ID,
      role: MEMBERSHIP_ROLES.MEMBER,
    });
    expect(createMember).toHaveBeenCalledWith({
      roomId: ROOM_ID,
      userId: PEER_ID,
      role: MEMBERSHIP_ROLES.MEMBER,
    });
  });

  it('rejects adding a third participant to a direct room', async () => {
    findRoomById.mockResolvedValue(room({ type: ROOM_TYPES.DIRECT, ownerId: undefined }));
    findByRoomAndUser.mockResolvedValue(
      member({ userId: OWNER_ID, role: MEMBERSHIP_ROLES.MEMBER }),
    );

    await expect(service.addMember(OWNER_ID, ROOM_ID, { userId: MEMBER_ID })).rejects.toMatchObject(
      {
        code: ROOM_ERROR_CODES.INSUFFICIENT_ROOM_ROLE,
      },
    );
  });

  it('rejects a member promoting or removing other members', async () => {
    findRoomById.mockResolvedValue(room({ type: ROOM_TYPES.PRIVATE }));
    findByRoomAndUser.mockResolvedValue(
      member({ userId: MEMBER_ID, role: MEMBERSHIP_ROLES.MEMBER }),
    );

    await expect(service.addMember(MEMBER_ID, ROOM_ID, { userId: PEER_ID })).rejects.toMatchObject({
      code: ROOM_ERROR_CODES.INSUFFICIENT_ROOM_ROLE,
    });

    await expect(service.removeMember(MEMBER_ID, ROOM_ID, PEER_ID)).rejects.toMatchObject({
      code: ROOM_ERROR_CODES.INSUFFICIENT_ROOM_ROLE,
    });
  });

  it('rejects creating a direct room with a missing peer', async () => {
    findUserById.mockResolvedValue(null);

    await expect(
      service.createRoom(OWNER_ID, { type: ROOM_TYPES.DIRECT, peerUserId: PEER_ID }),
    ).rejects.toMatchObject({
      code: USER_ERROR_CODES.USER_NOT_FOUND,
    });
  });

  it('refuses member-list and mutations on a private room without membership', async () => {
    findRoomById.mockResolvedValue(room({ type: ROOM_TYPES.PRIVATE }));
    findByRoomAndUser.mockResolvedValue(null);

    await expect(service.listMembers(MEMBER_ID, ROOM_ID)).rejects.toMatchObject({
      code: ROOM_ERROR_CODES.ROOM_ACCESS_DENIED,
    });
    await expect(service.updateRoom(MEMBER_ID, ROOM_ID, { name: 'Stolen' })).rejects.toMatchObject({
      code: ROOM_ERROR_CODES.ROOM_ACCESS_DENIED,
    });
    await expect(service.deleteRoom(MEMBER_ID, ROOM_ID)).rejects.toMatchObject({
      code: ROOM_ERROR_CODES.ROOM_ACCESS_DENIED,
    });
    await expect(service.removeMember(MEMBER_ID, ROOM_ID, OWNER_ID)).rejects.toMatchObject({
      code: ROOM_ERROR_CODES.ROOM_ACCESS_DENIED,
    });
  });

  it('refuses a member promoting themselves or transferring ownership', async () => {
    findRoomById.mockResolvedValue(room({ type: ROOM_TYPES.PRIVATE }));
    findByRoomAndUser.mockResolvedValue(
      member({ userId: MEMBER_ID, role: MEMBERSHIP_ROLES.MEMBER }),
    );

    await expect(
      service.addMember(MEMBER_ID, ROOM_ID, {
        userId: MEMBER_ID,
        role: MEMBERSHIP_ROLES.MODERATOR,
      }),
    ).rejects.toMatchObject({ code: ROOM_ERROR_CODES.INSUFFICIENT_ROOM_ROLE });

    await expect(
      service.updateRoom(MEMBER_ID, ROOM_ID, { ownerId: MEMBER_ID }),
    ).rejects.toMatchObject({ code: ROOM_ERROR_CODES.INSUFFICIENT_ROOM_ROLE });
  });

  it('blocks a moderator from adding themselves as a way to change role', async () => {
    findRoomById.mockResolvedValue(room({ type: ROOM_TYPES.PRIVATE }));
    findByRoomAndUser.mockResolvedValue(
      member({ userId: MEMBER_ID, role: MEMBERSHIP_ROLES.MODERATOR }),
    );

    await expect(
      service.addMember(MEMBER_ID, ROOM_ID, {
        userId: MEMBER_ID,
        role: MEMBERSHIP_ROLES.MODERATOR,
      }),
    ).rejects.toMatchObject({ code: ROOM_ERROR_CODES.INVALID_ROOM_OPERATION });
    expect(createMember).not.toHaveBeenCalled();
  });

  it('refuses a moderator assigning the moderator role', async () => {
    findRoomById.mockResolvedValue(room({ type: ROOM_TYPES.PRIVATE }));
    findByRoomAndUser.mockResolvedValue(
      member({ userId: MEMBER_ID, role: MEMBERSHIP_ROLES.MODERATOR }),
    );
    findUserById.mockResolvedValue({
      id: PEER_ID,
      username: 'peer',
      email: 'peer@example.com',
      displayName: 'Peer',
      role: 'USER',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      service.addMember(MEMBER_ID, ROOM_ID, {
        userId: PEER_ID,
        role: MEMBERSHIP_ROLES.MODERATOR,
      }),
    ).rejects.toMatchObject({ code: ROOM_ERROR_CODES.INSUFFICIENT_ROOM_ROLE });
  });

  it('never creates an owner membership through addMember', async () => {
    findRoomById.mockResolvedValue(room({ type: ROOM_TYPES.PRIVATE }));
    findByRoomAndUser.mockResolvedValue(member());

    await expect(
      service.addMember(OWNER_ID, ROOM_ID, {
        userId: PEER_ID,
        role: MEMBERSHIP_ROLES.OWNER,
      } as never),
    ).rejects.toMatchObject({ code: ROOM_ERROR_CODES.INSUFFICIENT_ROOM_ROLE });
    expect(createMember).not.toHaveBeenCalled();
  });

  it('rejects manipulated room ids', async () => {
    await expect(service.getRoom(MEMBER_ID, 'not-a-room')).rejects.toMatchObject({
      code: ROOM_ERROR_CODES.ROOM_NOT_FOUND,
    });
    await expect(service.getRoom(MEMBER_ID, '../' + ROOM_ID)).rejects.toMatchObject({
      code: ROOM_ERROR_CODES.ROOM_NOT_FOUND,
    });
    await expect(service.getRoom(MEMBER_ID, ROOM_ID.toUpperCase())).rejects.toMatchObject({
      code: ROOM_ERROR_CODES.ROOM_NOT_FOUND,
    });
  });

  it('does not let an outsider leave or delete a direct room', async () => {
    findRoomById.mockResolvedValue(room({ type: ROOM_TYPES.DIRECT, ownerId: undefined }));
    findByRoomAndUser.mockResolvedValue(null);

    await expect(service.leaveRoom(MEMBER_ID, ROOM_ID)).rejects.toMatchObject({
      code: ROOM_ERROR_CODES.ROOM_ACCESS_DENIED,
    });
    await expect(service.deleteRoom(MEMBER_ID, ROOM_ID)).rejects.toMatchObject({
      code: ROOM_ERROR_CODES.ROOM_ACCESS_DENIED,
    });
    expect(deleteRoomById).not.toHaveBeenCalled();
    expect(deleteByRoomId).not.toHaveBeenCalled();
  });

  it('refuses mutations on a public room by a non-member', async () => {
    findRoomById.mockResolvedValue(room());
    findByRoomAndUser.mockResolvedValue(null);

    await expect(service.updateRoom(MEMBER_ID, ROOM_ID, { name: 'Hijack' })).rejects.toMatchObject({
      code: ROOM_ERROR_CODES.NOT_A_MEMBER,
    });
    await expect(service.listMembers(MEMBER_ID, ROOM_ID)).rejects.toMatchObject({
      code: ROOM_ERROR_CODES.NOT_A_MEMBER,
    });
  });

  it('lists member user ids for notification fan-out', async () => {
    findByRoomId.mockResolvedValue([
      member({ userId: OWNER_ID }),
      member({ userId: MEMBER_ID, role: MEMBERSHIP_ROLES.MEMBER }),
    ]);

    await expect(service.listMemberUserIds(ROOM_ID)).resolves.toEqual([OWNER_ID, MEMBER_ID]);
  });

  it('maps a duplicate-key race on direct room create to conflict', async () => {
    findUserById.mockResolvedValue({
      id: PEER_ID,
      username: 'peer',
      email: 'peer@example.com',
      displayName: 'Peer',
      role: 'USER',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    findByDirectKey
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(room({ type: ROOM_TYPES.DIRECT, ownerId: undefined }));
    createRoom.mockRejectedValue({ code: 11000 });

    await expect(
      service.createRoom(OWNER_ID, { type: ROOM_TYPES.DIRECT, peerUserId: PEER_ID }),
    ).rejects.toMatchObject({
      code: ROOM_ERROR_CODES.DIRECT_ROOM_ALREADY_EXISTS,
    });
  });

  it('rejects a read cursor that belongs to another room', async () => {
    findRoomById.mockResolvedValue(room());
    findByRoomAndUser.mockResolvedValue(member());
    findMessageById.mockResolvedValue({
      id: '507f1f77bcf86cd799439041',
      roomId: '507f1f77bcf86cd799439099',
      authorId: OWNER_ID,
      content: 'Elsewhere',
      clientMessageId: 'other-room',
      attachments: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      service.markRoomRead(OWNER_ID, ROOM_ID, { messageId: '507f1f77bcf86cd799439041' }),
    ).rejects.toMatchObject({
      code: ROOM_ERROR_CODES.INVALID_ROOM_OPERATION,
    });
    expect(updateReadState).not.toHaveBeenCalled();
  });

  it('rejects a missing read cursor message', async () => {
    findRoomById.mockResolvedValue(room());
    findByRoomAndUser.mockResolvedValue(member());
    findMessageById.mockResolvedValue(null);

    await expect(
      service.markRoomRead(OWNER_ID, ROOM_ID, { messageId: '507f1f77bcf86cd799439041' }),
    ).rejects.toMatchObject({
      code: MESSAGE_ERROR_CODES.MESSAGE_NOT_FOUND,
    });
  });

  it('rejects a deleted message as a read cursor', async () => {
    findRoomById.mockResolvedValue(room());
    findByRoomAndUser.mockResolvedValue(member());
    findMessageById.mockResolvedValue({
      id: '507f1f77bcf86cd799439041',
      roomId: ROOM_ID,
      authorId: OWNER_ID,
      content: 'Gone',
      clientMessageId: 'deleted',
      attachments: [],
      deletedAt: new Date('2026-08-18T03:00:00.000Z'),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      service.markRoomRead(OWNER_ID, ROOM_ID, { messageId: '507f1f77bcf86cd799439041' }),
    ).rejects.toMatchObject({
      code: ROOM_ERROR_CODES.INVALID_ROOM_OPERATION,
    });
    expect(updateReadState).not.toHaveBeenCalled();
  });

  it('rolls back a direct room when the second membership insert fails', async () => {
    findUserById.mockResolvedValue({
      id: PEER_ID,
      username: 'peer',
      email: 'peer@example.com',
      displayName: 'Peer',
      role: 'USER',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    findByDirectKey.mockResolvedValue(null);
    createRoom.mockResolvedValue(
      room({ type: ROOM_TYPES.DIRECT, ownerId: undefined, name: undefined }),
    );
    createMember
      .mockResolvedValueOnce(member({ role: MEMBERSHIP_ROLES.MEMBER }))
      .mockRejectedValueOnce(new Error('membership write failed'));

    await expect(
      service.createRoom(OWNER_ID, { type: ROOM_TYPES.DIRECT, peerUserId: PEER_ID }),
    ).rejects.toThrow('membership write failed');

    expect(deleteByRoomId).toHaveBeenCalledWith(ROOM_ID);
    expect(deleteRoomById).toHaveBeenCalledWith(ROOM_ID);
  });

  it('evicts a removed member from the realtime room', async () => {
    findRoomById.mockResolvedValue(room({ type: ROOM_TYPES.PRIVATE }));
    findByRoomAndUser.mockImplementation((_roomId, userId) => {
      if (userId === OWNER_ID) {
        return Promise.resolve(member());
      }

      if (userId === MEMBER_ID) {
        return Promise.resolve(member({ userId: MEMBER_ID, role: MEMBERSHIP_ROLES.MEMBER }));
      }

      return Promise.resolve(null);
    });

    await service.removeMember(OWNER_ID, ROOM_ID, MEMBER_ID);

    expect(deleteByRoomAndUser).toHaveBeenCalledWith(ROOM_ID, MEMBER_ID);
    expect(evictMemberFromRoom).toHaveBeenCalledWith(ROOM_ID, MEMBER_ID);
  });

  it('evicts a leaving member from the realtime room', async () => {
    findRoomById.mockResolvedValue(room({ type: ROOM_TYPES.PRIVATE }));
    findByRoomAndUser.mockResolvedValue(
      member({ userId: MEMBER_ID, role: MEMBERSHIP_ROLES.MEMBER }),
    );

    await service.leaveRoom(MEMBER_ID, ROOM_ID);

    expect(deleteByRoomAndUser).toHaveBeenCalledWith(ROOM_ID, MEMBER_ID);
    expect(evictMemberFromRoom).toHaveBeenCalledWith(ROOM_ID, MEMBER_ID);
  });

  it('evicts both participants when a direct room is left', async () => {
    findRoomById.mockResolvedValue(room({ type: ROOM_TYPES.DIRECT, ownerId: undefined }));
    findByRoomAndUser.mockResolvedValue(
      member({ userId: OWNER_ID, role: MEMBERSHIP_ROLES.MEMBER }),
    );
    findByRoomId.mockResolvedValue([
      member({ userId: OWNER_ID, role: MEMBERSHIP_ROLES.MEMBER }),
      member({ userId: PEER_ID, role: MEMBERSHIP_ROLES.MEMBER }),
    ]);

    await service.leaveRoom(OWNER_ID, ROOM_ID);

    expect(deleteByRoomId).toHaveBeenCalledWith(ROOM_ID);
    expect(deleteRoomById).toHaveBeenCalledWith(ROOM_ID);
    expect(evictMemberFromRoom).toHaveBeenCalledWith(ROOM_ID, OWNER_ID);
    expect(evictMemberFromRoom).toHaveBeenCalledWith(ROOM_ID, PEER_ID);
  });
});
