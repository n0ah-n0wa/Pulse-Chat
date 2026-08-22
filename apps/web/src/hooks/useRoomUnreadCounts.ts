import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { countUnreadMessages } from '../lib/unread-count';
import { flattenMessagesChronological, type MessagesInfiniteData } from '../lib/message-cache';
import { queryKeys } from '../lib/query-keys';
import { useRoomsQuery } from './useRoomsQuery';
import { useUnreadStore } from '../store/unread-store';
import { useRoomUiStore } from '../store/room-ui-store';

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function queryKeyRoot(queryKey: unknown): unknown {
  if (!isUnknownArray(queryKey)) {
    return undefined;
  }

  return queryKey[0];
}

function messageListRoomId(queryKey: unknown): string | undefined {
  if (!isUnknownArray(queryKey)) {
    return undefined;
  }

  if (queryKey[0] !== 'messages' || queryKey[1] !== 'list') {
    return undefined;
  }

  return typeof queryKey[2] === 'string' ? queryKey[2] : undefined;
}

export function useRoomUnreadCounts(): ReadonlyMap<string, number> {
  const queryClient = useQueryClient();
  const roomsQuery = useRoomsQuery();
  const increments = useUnreadStore((state) => state.increments);
  const currentRoomId = useRoomUiStore((state) => state.currentRoomId);
  const [cacheVersion, setCacheVersion] = useState(0);

  useEffect(() => {
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated') {
        return;
      }

      const root = queryKeyRoot(event.query.queryKey);
      if (root === 'rooms') {
        setCacheVersion((value) => value + 1);
        return;
      }

      if (root !== 'messages') {
        return;
      }

      const listRoomId = messageListRoomId(event.query.queryKey);
      if (listRoomId !== undefined && listRoomId === useRoomUiStore.getState().currentRoomId) {
        return;
      }

      setCacheVersion((value) => value + 1);
    });
  }, [queryClient]);

  return useMemo(() => {
    void cacheVersion;
    const counts = new Map<string, number>();
    const rooms = roomsQuery.data ?? [];

    for (const room of rooms) {
      if (room.id === currentRoomId) {
        counts.set(room.id, 0);
        continue;
      }

      const messageData = queryClient.getQueryData<MessagesInfiniteData>(
        queryKeys.messages.list(room.id),
      );
      const messages = flattenMessagesChronological(messageData);
      const extra = increments[room.id] ?? 0;
      counts.set(room.id, countUnreadMessages(messages, room.lastReadMessageId, extra));
    }

    return counts;
  }, [roomsQuery.data, increments, currentRoomId, cacheVersion, queryClient]);
}

export function useTotalRoomUnread(): number {
  const counts = useRoomUnreadCounts();
  let total = 0;
  for (const count of counts.values()) {
    total += count;
  }
  return total;
}
