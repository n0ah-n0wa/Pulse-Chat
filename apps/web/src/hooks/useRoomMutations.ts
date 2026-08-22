import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import {
  ROOM_ERROR_CODES,
  ROOM_TYPES,
  type CreateRoomInput,
  type RoomMemberResponse,
  type RoomResponse,
} from '@pulse-chat/shared';

import { isApiClientError } from '../lib/errors';
import { queryKeys } from '../lib/query-keys';
import { findDirectRoomWithPeer } from '../lib/room-display';
import { roomsService } from '../services/rooms-service';

function rememberRoom(queryClient: QueryClient, room: RoomResponse): void {
  queryClient.setQueryData<RoomResponse[]>(queryKeys.rooms.list(), (current) => {
    if (current === undefined) {
      return [room];
    }

    if (current.some((entry) => entry.id === room.id)) {
      return current;
    }

    return [room, ...current];
  });
  queryClient.setQueryData(queryKeys.rooms.detail(room.id), room);
}

export function useCreateRoom() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (input: CreateRoomInput) => roomsService.create(input),
    onSuccess: (room: RoomResponse) => {
      rememberRoom(queryClient, room);
      void navigate(`/app/rooms/${room.id}`);
    },
  });
}

export function useJoinRoom() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (roomId: string) => roomsService.join(roomId),
    onSuccess: (membership: RoomMemberResponse) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.rooms.list() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.rooms.detail(membership.roomId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.rooms.members(membership.roomId) });
      void navigate(`/app/rooms/${membership.roomId}`);
    },
  });
}

export function useAddRoomMember(roomId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => roomsService.addMember(roomId, { userId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.rooms.members(roomId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.rooms.list() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list() });
    },
  });
}

export function useOpenDirectRoom() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async (peerUserId: string): Promise<RoomResponse> => {
      const cached = queryClient.getQueryData<RoomResponse[]>(queryKeys.rooms.list());
      const existing = findDirectRoomWithPeer(cached, peerUserId);
      if (existing !== undefined) {
        return existing;
      }

      try {
        return await roomsService.create({
          type: ROOM_TYPES.DIRECT,
          peerUserId,
        });
      } catch (error) {
        if (isApiClientError(error) && error.code === ROOM_ERROR_CODES.DIRECT_ROOM_ALREADY_EXISTS) {
          const listed = await roomsService.list();
          queryClient.setQueryData(queryKeys.rooms.list(), listed);
          const found = findDirectRoomWithPeer(listed, peerUserId);
          if (found !== undefined) {
            return found;
          }
        }

        throw error;
      }
    },
    onSuccess: (room: RoomResponse) => {
      rememberRoom(queryClient, room);
      void navigate(`/app/rooms/${room.id}`);
    },
  });
}
