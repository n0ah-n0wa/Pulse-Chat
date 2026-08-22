import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { MarkRoomReadInput, RoomMemberResponse, RoomResponse } from '@pulse-chat/shared';

import { queryKeys } from '../lib/query-keys';
import { roomsService } from '../services/rooms-service';
import { useUnreadStore } from '../store/unread-store';

export function useMarkRoomRead(roomId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: MarkRoomReadInput) => roomsService.markRead(roomId, input),
    onSuccess: (membership: RoomMemberResponse) => {
      useUnreadStore.getState().clear(roomId);

      queryClient.setQueryData<RoomResponse[]>(queryKeys.rooms.list(), (rooms) =>
        rooms?.map((room) =>
          room.id === roomId
            ? {
                ...room,
                lastReadMessageId: membership.lastReadMessageId,
                lastReadAt: membership.lastReadAt,
              }
            : room,
        ),
      );

      queryClient.setQueryData<RoomResponse>(queryKeys.rooms.detail(roomId), (room) =>
        room === undefined
          ? room
          : {
              ...room,
              lastReadMessageId: membership.lastReadMessageId,
              lastReadAt: membership.lastReadAt,
            },
      );
    },
  });
}
