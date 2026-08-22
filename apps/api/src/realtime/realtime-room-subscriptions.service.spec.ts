import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import {
  MEMBERSHIP_ROLES,
  ROOM_ERROR_CODES,
  ROOM_TYPES,
  SERVER_SOCKET_EVENTS,
} from '@pulse-chat/shared';

import { ApiException } from '../common/errors/api.exception.js';
import type { NestStructuredLoggerService } from '../infrastructure/logging/nest-structured-logger.service.js';
import type { PresenceService } from '../presence/presence.service.js';
import type { RoomsService } from '../rooms/rooms.service.js';
import { RealtimeConnectionStateService } from './realtime-connection-state.service.js';
import { RealtimeRoomSubscriptionsService } from './realtime-room-subscriptions.service.js';
import type { AuthenticatedSocket } from './realtime.types.js';

const ROOM_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439012';

function createMockSocket(): {
  socket: AuthenticatedSocket;
  join: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  toEmit: ReturnType<typeof vi.fn>;
} {
  const rooms = new Set<string>();
  const join = vi.fn((roomId: string) => {
    rooms.add(roomId);
    return Promise.resolve();
  });
  const leave = vi.fn((roomId: string) => {
    rooms.delete(roomId);
    return Promise.resolve();
  });
  const emit = vi.fn();
  const toEmit = vi.fn();
  const socket = {
    id: 'socket-1',
    data: { userId: USER_ID },
    rooms,
    join,
    leave,
    emit,
    to: vi.fn().mockReturnValue({ emit: toEmit }),
  } as unknown as AuthenticatedSocket;

  return { socket, join, leave, emit, toEmit };
}

describe('RealtimeRoomSubscriptionsService', () => {
  const roomResponse = {
    id: ROOM_ID,
    name: 'Town Hall',
    type: ROOM_TYPES.PUBLIC,
    ownerId: USER_ID,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    currentUserRole: MEMBERSHIP_ROLES.OWNER,
  };

  const OTHER_USER_ID = '507f1f77bcf86cd799439013';

  function createService(
    roomsService: RoomsService,
    connections: RealtimeConnectionStateService,
    presence: Pick<PresenceService, 'getPresence' | 'getPresenceMany'> = {
      getPresence: vi.fn().mockResolvedValue(null),
      getPresenceMany: vi.fn().mockResolvedValue(new Map()),
    },
  ): RealtimeRoomSubscriptionsService {
    return new RealtimeRoomSubscriptionsService(
      roomsService,
      connections,
      presence as PresenceService,
      { warn: vi.fn() } as unknown as NestStructuredLoggerService,
    );
  }

  it('joins an authorized room and returns room state', async () => {
    const { socket, join, emit } = createMockSocket();
    const requireMember = vi.fn().mockResolvedValue({});
    const getRoom = vi.fn().mockResolvedValue(roomResponse);
    const listMembers = vi.fn().mockResolvedValue([]);
    const roomsService = { requireMember, getRoom, listMembers } as unknown as RoomsService;
    const connections = new RealtimeConnectionStateService();
    connections.registerConnection(socket.id, USER_ID);
    const service = createService(roomsService, connections);

    await service.joinRoom(socket, { roomId: ROOM_ID });

    expect(requireMember).toHaveBeenCalledWith(USER_ID, ROOM_ID);
    expect(getRoom).toHaveBeenCalledWith(USER_ID, ROOM_ID);
    expect(join).toHaveBeenCalledWith(ROOM_ID);
    expect(connections.getRoomSubscriptions(socket.id)).toEqual([ROOM_ID]);
    expect(emit).toHaveBeenCalledWith(SERVER_SOCKET_EVENTS.ROOM_JOINED, {
      roomId: ROOM_ID,
      room: roomResponse,
    });
  });

  it('rejects unauthorized room joins before subscribing', async () => {
    const { socket, join } = createMockSocket();
    const requireMember = vi
      .fn()
      .mockRejectedValue(
        new ApiException(
          ROOM_ERROR_CODES.NOT_A_MEMBER,
          'You are not a member of this room.',
          HttpStatus.FORBIDDEN,
        ),
      );
    const getRoom = vi.fn();
    const listMembers = vi.fn();
    const roomsService = { requireMember, getRoom, listMembers } as unknown as RoomsService;
    const connections = new RealtimeConnectionStateService();
    const service = createService(roomsService, connections);

    await expect(service.joinRoom(socket, { roomId: ROOM_ID })).rejects.toMatchObject({
      code: ROOM_ERROR_CODES.NOT_A_MEMBER,
    });

    expect(join).not.toHaveBeenCalled();
    expect(getRoom).not.toHaveBeenCalled();
    expect(connections.getRoomSubscriptions(socket.id)).toEqual([]);
  });

  it('rejects malformed join payloads before authorizing the room', async () => {
    const { socket, join } = createMockSocket();
    const requireMember = vi.fn();
    const getRoom = vi.fn();
    const listMembers = vi.fn();
    const roomsService = { requireMember, getRoom, listMembers } as unknown as RoomsService;
    const connections = new RealtimeConnectionStateService();
    const service = createService(roomsService, connections);

    await expect(service.joinRoom(socket, { roomId: 'bad-id' })).rejects.toThrow();

    expect(requireMember).not.toHaveBeenCalled();
    expect(join).not.toHaveBeenCalled();
  });

  it('leaves a subscribed room and clears tracked state', async () => {
    const { socket, leave, emit } = createMockSocket();
    const roomsService = {} as RoomsService;
    const connections = new RealtimeConnectionStateService();
    connections.registerConnection(socket.id, USER_ID);
    connections.addRoomSubscription(socket.id, ROOM_ID);
    const service = createService(roomsService, connections);

    await service.leaveRoom(socket, { roomId: ROOM_ID });

    expect(leave).toHaveBeenCalledWith(ROOM_ID);
    expect(connections.getRoomSubscriptions(socket.id)).toEqual([]);
    expect(emit).toHaveBeenCalledWith(SERVER_SOCKET_EVENTS.ROOM_LEFT, { roomId: ROOM_ID });
  });

  it('rejects malformed leave payloads', async () => {
    const { socket, leave } = createMockSocket();
    const roomsService = {} as RoomsService;
    const connections = new RealtimeConnectionStateService();
    const service = createService(roomsService, connections);

    await expect(service.leaveRoom(socket, { roomId: 'bad-id' })).rejects.toThrow();

    expect(leave).not.toHaveBeenCalled();
  });

  it('emits a presence snapshot of currently online members on join', async () => {
    const { socket, emit, toEmit } = createMockSocket();
    const requireMember = vi.fn().mockResolvedValue({});
    const getRoom = vi.fn().mockResolvedValue(roomResponse);
    const listMembers = vi.fn().mockResolvedValue([{ userId: USER_ID }, { userId: OTHER_USER_ID }]);
    const roomsService = { requireMember, getRoom, listMembers } as unknown as RoomsService;
    const connections = new RealtimeConnectionStateService();
    connections.registerConnection(socket.id, USER_ID);
    const lastSeenAt = new Date('2026-08-18T12:00:00.000Z');
    const snapshot = {
      userId: OTHER_USER_ID,
      status: 'online' as const,
      lastSeenAt,
      instanceId: 'test',
      socketIds: ['socket-other'],
    };
    const getPresence = vi.fn().mockResolvedValue({
      userId: USER_ID,
      status: 'online',
      lastSeenAt,
      instanceId: 'test',
      socketIds: ['socket-1'],
    });
    const getPresenceMany = vi.fn().mockResolvedValue(new Map([[OTHER_USER_ID, snapshot]]));
    const service = createService(roomsService, connections, { getPresence, getPresenceMany });

    await service.joinRoom(socket, { roomId: ROOM_ID });

    expect(emit).toHaveBeenCalledWith(SERVER_SOCKET_EVENTS.USER_ONLINE, {
      userId: OTHER_USER_ID,
      lastSeenAt: lastSeenAt.toISOString(),
    });
    expect(toEmit).toHaveBeenCalledWith(SERVER_SOCKET_EVENTS.USER_ONLINE, {
      userId: USER_ID,
      lastSeenAt: lastSeenAt.toISOString(),
    });
  });

  it('still joins when presence snapshot lookup fails', async () => {
    const { socket, join, emit } = createMockSocket();
    const requireMember = vi.fn().mockResolvedValue({});
    const getRoom = vi.fn().mockResolvedValue(roomResponse);
    const listMembers = vi.fn().mockRejectedValue(new Error('Redis is temporarily unavailable'));
    const roomsService = { requireMember, getRoom, listMembers } as unknown as RoomsService;
    const connections = new RealtimeConnectionStateService();
    connections.registerConnection(socket.id, USER_ID);
    const service = createService(roomsService, connections);

    await service.joinRoom(socket, { roomId: ROOM_ID });

    expect(join).toHaveBeenCalledWith(ROOM_ID);
    expect(emit).toHaveBeenCalledWith(SERVER_SOCKET_EVENTS.ROOM_JOINED, {
      roomId: ROOM_ID,
      room: roomResponse,
    });
  });

  it('re-joins Socket.IO when connection tracking is stale after a kick', async () => {
    const { socket, join } = createMockSocket();
    const requireMember = vi.fn().mockResolvedValue({});
    const getRoom = vi.fn().mockResolvedValue(roomResponse);
    const listMembers = vi.fn().mockResolvedValue([]);
    const roomsService = { requireMember, getRoom, listMembers } as unknown as RoomsService;
    const connections = new RealtimeConnectionStateService();
    connections.registerConnection(socket.id, USER_ID);
    connections.addRoomSubscription(socket.id, ROOM_ID);
    const service = createService(roomsService, connections);

    await service.joinRoom(socket, { roomId: ROOM_ID });

    expect(join).toHaveBeenCalledWith(ROOM_ID);
    expect(socket.rooms.has(ROOM_ID)).toBe(true);
  });
});
