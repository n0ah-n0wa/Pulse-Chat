import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import type { CreateRoomInput, RoomMemberResponse, RoomResponse } from '@pulse-chat/shared';

import { queryKeys } from '../lib/query-keys';
import { roomsService } from '../services/rooms-service';

export function useCreateRoom() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (input: CreateRoomInput) => roomsService.create(input),
    onSuccess: (room: RoomResponse) => {
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
