import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SERVER_SOCKET_EVENTS } from '@pulse-chat/shared';

import {
  bindRealtimeQueryClient,
  resetRealtimeSyncForTests,
  startRealtimeSync,
} from './realtime-sync-service';
import { resetSocketServiceForTests } from './socket-service';
import { queryKeys } from '../lib/query-keys';
import type { MessagesInfiniteData } from '../lib/message-cache';

const listeners = new Map<string, Set<(payload: unknown) => void>>();
const reconnectHandlers = new Set<() => void>();

vi.mock('./socket-service', () => ({
  getSocketService: () => ({
    addServerListener: (event: string, listener: (payload: unknown) => void) => {
      const bucket = listeners.get(event) ?? new Set();
      bucket.add(listener);
      listeners.set(event, bucket);
      return () => {
        bucket.delete(listener);
      };
    },
    onReconnect: (handler: () => void) => {
      reconnectHandlers.add(handler);
      return () => {
        reconnectHandlers.delete(handler);
      };
    },
    getJoinedRoomIds: () => ['507f1f77bcf86cd799439021'],
  }),
  resetSocketServiceForTests: vi.fn(),
}));

describe('RealtimeSyncService', () => {
  beforeEach(() => {
    resetRealtimeSyncForTests();
    resetSocketServiceForTests();
    listeners.clear();
    reconnectHandlers.clear();
  });

  it('registers multiplexed listeners once and updates the query cache', () => {
    const queryClient = new QueryClient();
    bindRealtimeQueryClient(queryClient);

    const stop = startRealtimeSync();
    const stopAgain = startRealtimeSync();

    expect(listeners.get(SERVER_SOCKET_EVENTS.MESSAGE_NEW)?.size).toBe(1);

    const roomId = '507f1f77bcf86cd799439021';
    queryClient.setQueryData<MessagesInfiniteData>(queryKeys.messages.list(roomId), {
      pageParams: [undefined],
      pages: [{ items: [] }],
    });

    const payload = {
      message: {
        id: '507f1f77bcf86cd799439041',
        roomId,
        authorId: '507f1f77bcf86cd799439011',
        content: 'Live',
        clientMessageId: 'client-live',
        attachments: [],
        reactions: [],
        createdAt: '2026-08-18T00:00:00.000Z',
        updatedAt: '2026-08-18T00:00:00.000Z',
      },
    };

    for (const listener of listeners.get(SERVER_SOCKET_EVENTS.MESSAGE_NEW) ?? []) {
      listener(payload);
    }

    const data = queryClient.getQueryData<MessagesInfiniteData>(
      queryKeys.messages.list('507f1f77bcf86cd799439021'),
    );
    expect(data?.pages[0]?.items[0]?.content).toBe('Live');

    stopAgain();
    stop();
    expect(listeners.get(SERVER_SOCKET_EVENTS.MESSAGE_NEW)?.size).toBe(0);
  });

  it('applies room:left by dropping the room message cache', () => {
    const queryClient = new QueryClient();
    bindRealtimeQueryClient(queryClient);
    const roomId = '507f1f77bcf86cd799439021';
    queryClient.setQueryData<MessagesInfiniteData>(queryKeys.messages.list(roomId), {
      pageParams: [undefined],
      pages: [
        {
          items: [
            {
              id: '507f1f77bcf86cd799439041',
              roomId,
              authorId: '507f1f77bcf86cd799439011',
              content: 'Live',
              clientMessageId: 'client-live',
              attachments: [],
              reactions: [],
              createdAt: '2026-08-18T00:00:00.000Z',
              updatedAt: '2026-08-18T00:00:00.000Z',
            },
          ],
        },
      ],
    });

    const stop = startRealtimeSync();
    for (const listener of listeners.get(SERVER_SOCKET_EVENTS.ROOM_LEFT) ?? []) {
      listener({ roomId });
    }

    expect(queryClient.getQueryData(queryKeys.messages.list(roomId))).toBeUndefined();
    stop();
  });

  it('invalidates joined rooms when reconnect handlers fire', () => {
    const queryClient = new QueryClient();
    bindRealtimeQueryClient(queryClient);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const stop = startRealtimeSync();
    for (const handler of reconnectHandlers) {
      handler();
    }

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.messages.list('507f1f77bcf86cd799439021'),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.rooms.list(),
    });

    stop();
  });
});
