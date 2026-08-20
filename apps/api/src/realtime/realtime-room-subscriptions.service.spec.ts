import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import {
  MEMBERSHIP_ROLES,
  ROOM_ERROR_CODES,
  ROOM_TYPES,
  SERVER_SOCKET_EVENTS,
} from '@pulse-chat/shared';

import { ApiException } from '../common/errors/api.exception.js';
import { RealtimeConnectionStateService } from './realtime-connection-state.service.js';
import { RealtimeRoomSubscriptionsService } from './realtime-room-subscriptions.service.js';
import type { AuthenticatedSocket } from './realtime.types.js';
import type { RoomsService } from '../rooms/rooms.service.js';

const ROOM_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439012';

function createMockSocket(): {
  socket: AuthenticatedSocket;
  join: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
} {
  const join = vi.fn().mockResolvedValue(undefined);
  const leave = vi.fn().mockResolvedValue(undefined);
  const emit = vi.fn();
  const socket = {
    id: 'socket-1',
    data: { userId: USER_ID },
    join,
    leave,
    emit,
  } as unknown as AuthenticatedSocket;

  return { socket, join, leave, emit };
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

  it('joins an authorized room and returns room state', async () => {
    const { socket, join, emit } = createMockSocket();
    const requireMember = vi.fn().mockResolvedValue({});
    const getRoom = vi.fn().mockResolvedValue(roomResponse);
    const roomsService = { requireMember, getRoom } as unknown as RoomsService;
    const connections = new RealtimeConnectionStateService();
    connections.registerConnection(socket.id, USER_ID);
    const service = new RealtimeRoomSubscriptionsService(roomsService, connections);

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
    const roomsService = { requireMember, getRoom } as unknown as RoomsService;
    const connections = new RealtimeConnectionStateService();
    const service = new RealtimeRoomSubscriptionsService(roomsService, connections);

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
    const roomsService = { requireMember, getRoom } as unknown as RoomsService;
    const connections = new RealtimeConnectionStateService();
    const service = new RealtimeRoomSubscriptionsService(roomsService, connections);

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
    const service = new RealtimeRoomSubscriptionsService(roomsService, connections);

    await service.leaveRoom(socket, { roomId: ROOM_ID });

    expect(leave).toHaveBeenCalledWith(ROOM_ID);
    expect(connections.getRoomSubscriptions(socket.id)).toEqual([]);
    expect(emit).toHaveBeenCalledWith(SERVER_SOCKET_EVENTS.ROOM_LEFT, { roomId: ROOM_ID });
  });

  it('rejects malformed leave payloads', async () => {
    const { socket, leave } = createMockSocket();
    const roomsService = {} as RoomsService;
    const connections = new RealtimeConnectionStateService();
    const service = new RealtimeRoomSubscriptionsService(roomsService, connections);

    await expect(service.leaveRoom(socket, { roomId: 'bad-id' })).rejects.toThrow();

    expect(leave).not.toHaveBeenCalled();
  });
});
