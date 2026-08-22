import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ROOM_TYPES, type MessageResponse, type RoomResponse } from '@pulse-chat/shared';

import { type MessagesInfiniteData } from './message-cache';
import { optimisticMessageIdForClient } from './message-utils';
import { queryKeys } from './query-keys';
import {
  applyMessageNew,
  applyReactionChanged,
  applyRoomJoined,
  applyRoomLeft,
  applyUserPresence,
  refreshAfterReconnect,
} from './realtime-query-sync';
import { setRealtimeCurrentUserId } from './realtime-sync-context';
import { usePresenceStore } from '../store/presence-store';
import { useRoomUiStore } from '../store/room-ui-store';
import { useUnreadStore } from '../store/unread-store';

function message(overrides: Partial<MessageResponse> = {}): MessageResponse {
  return {
    id: '507f1f77bcf86cd799439041',
    roomId: '507f1f77bcf86cd799439021',
    authorId: '507f1f77bcf86cd799439011',
    content: 'Hello',
    clientMessageId: 'client-1',
    attachments: [],
    reactions: [],
    createdAt: '2026-08-18T00:00:00.000Z',
    updatedAt: '2026-08-18T00:00:00.000Z',
    ...overrides,
  };
}

describe('realtime-query-sync', () => {
  beforeEach(() => {
    useUnreadStore.getState().reset();
    usePresenceStore.getState().resetPresence();
    useRoomUiStore.setState({ currentRoomId: null });
    setRealtimeCurrentUserId(undefined);
  });

  it('reconciles message:new with an existing optimistic row by clientMessageId', () => {
    const queryClient = new QueryClient();
    const roomId = '507f1f77bcf86cd799439021';
    const optimistic = message({
      id: '000000000000000000000001',
      clientMessageId: 'pending-abc',
      content: 'Draft',
    });
    const confirmed = message({
      id: '507f1f77bcf86cd799439099',
      clientMessageId: 'pending-abc',
      content: 'Draft',
    });

    const seed: MessagesInfiniteData = {
      pageParams: [undefined],
      pages: [{ items: [optimistic] }],
    };
    queryClient.setQueryData(queryKeys.messages.list(roomId), seed);

    applyMessageNew(queryClient, confirmed);

    const next = queryClient.getQueryData<MessagesInfiniteData>(queryKeys.messages.list(roomId));
    expect(next?.pages[0]?.items).toHaveLength(1);
    expect(next?.pages[0]?.items[0]?.id).toBe('507f1f77bcf86cd799439099');
  });

  it('does not duplicate a message:new that is already in the cache', () => {
    const queryClient = new QueryClient();
    const roomId = '507f1f77bcf86cd799439021';
    const existing = message();
    queryClient.setQueryData<MessagesInfiniteData>(queryKeys.messages.list(roomId), {
      pageParams: [undefined],
      pages: [{ items: [existing] }],
    });
    useRoomUiStore.setState({ currentRoomId: 'other-room' });
    setRealtimeCurrentUserId('someone-else');

    applyMessageNew(queryClient, existing);
    applyMessageNew(queryClient, { ...existing, content: 'Hello' });

    const next = queryClient.getQueryData<MessagesInfiniteData>(queryKeys.messages.list(roomId));
    expect(next?.pages[0]?.items).toHaveLength(1);
    expect(useUnreadStore.getState().increments[roomId]).toBeUndefined();
  });

  it('patches user presence into the profile cache', () => {
    const queryClient = new QueryClient();
    const userId = '507f1f77bcf86cd799439011';
    queryClient.setQueryData(queryKeys.users.profile(userId), {
      id: userId,
      username: 'alice',
      displayName: 'Alice',
      role: 'USER',
      createdAt: '2026-08-18T00:00:00.000Z',
    });

    applyUserPresence(
      queryClient,
      {
        userId,
        lastSeenAt: '2026-08-18T12:00:00.000Z',
      },
      true,
    );

    expect(queryClient.getQueryData(queryKeys.users.profile(userId))).toMatchObject({
      lastSeenAt: '2026-08-18T12:00:00.000Z',
    });
  });

  it('increments unread counts for messages in inactive rooms', () => {
    const queryClient = new QueryClient();
    useUnreadStore.getState().reset();
    useRoomUiStore.setState({ currentRoomId: '507f1f77bcf86cd799439099' });
    setRealtimeCurrentUserId('507f1f77bcf86cd799439099');

    applyMessageNew(queryClient, message({ authorId: '507f1f77bcf86cd799439012' }));

    expect(useUnreadStore.getState().increments['507f1f77bcf86cd799439021']).toBe(1);
    expect(
      queryClient.getQueryData(queryKeys.messages.list('507f1f77bcf86cd799439021')),
    ).toBeUndefined();
  });

  it('upserts inactive-room messages into an existing cache without incrementing unread', () => {
    const queryClient = new QueryClient();
    const incoming = message({
      id: '507f1f77bcf86cd799439042',
      clientMessageId: 'client-2',
      authorId: '507f1f77bcf86cd799439012',
    });
    queryClient.setQueryData<MessagesInfiniteData>(queryKeys.messages.list(incoming.roomId), {
      pageParams: [undefined],
      pages: [{ items: [message()] }],
    });
    useRoomUiStore.setState({ currentRoomId: '507f1f77bcf86cd799439099' });
    setRealtimeCurrentUserId('507f1f77bcf86cd799439099');

    applyMessageNew(queryClient, incoming);

    const next = queryClient.getQueryData<MessagesInfiniteData>(
      queryKeys.messages.list(incoming.roomId),
    );
    expect(next?.pages[0]?.items.map((item) => item.id)).toContain(incoming.id);
    expect(useUnreadStore.getState().increments[incoming.roomId]).toBeUndefined();
  });

  it('drops room message caches when the socket reports room:left', () => {
    const queryClient = new QueryClient();
    const roomId = '507f1f77bcf86cd799439021';
    queryClient.setQueryData<MessagesInfiniteData>(queryKeys.messages.list(roomId), {
      pageParams: [undefined],
      pages: [{ items: [message()] }],
    });
    useUnreadStore.getState().increment(roomId);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    applyRoomLeft(queryClient, roomId);

    expect(queryClient.getQueryData(queryKeys.messages.list(roomId))).toBeUndefined();
    expect(useUnreadStore.getState().increments[roomId]).toBeUndefined();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.rooms.list() });
  });

  it('refreshes rooms, unread, presence, and recent messages after reconnect', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const roomId = '507f1f77bcf86cd799439021';
    useRoomUiStore.setState({ currentRoomId: roomId });
    useUnreadStore.getState().increment(roomId);
    usePresenceStore.getState().setUserOnline('507f1f77bcf86cd799439011');

    const pending = message({
      id: optimisticMessageIdForClient('pending-outbox'),
      clientMessageId: 'pending-outbox',
      content: 'Unsent',
    });
    queryClient.setQueryData<MessagesInfiniteData>(queryKeys.messages.list(roomId), {
      pageParams: [undefined],
      pages: [{ items: [pending] }],
    });

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    await refreshAfterReconnect(queryClient, [roomId]);

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.messages.list(roomId) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.rooms.members(roomId) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.rooms.detail(roomId) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.rooms.list() });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.notifications.list() });
    expect(useUnreadStore.getState().increments[roomId]).toBeUndefined();
    expect(usePresenceStore.getState().onlineUserIds.size).toBe(0);

    const merged = queryClient.getQueryData<MessagesInfiniteData>(queryKeys.messages.list(roomId));
    expect(merged?.pages[0]?.items.some((item) => item.clientMessageId === 'pending-outbox')).toBe(
      true,
    );
  });

  it('updates the active room cache from room:joined', () => {
    const queryClient = new QueryClient();
    const room: RoomResponse = {
      id: '507f1f77bcf86cd799439021',
      name: 'General',
      type: ROOM_TYPES.PUBLIC,
      createdAt: '2026-08-18T00:00:00.000Z',
      updatedAt: '2026-08-18T00:00:00.000Z',
    };
    queryClient.setQueryData<RoomResponse[]>(queryKeys.rooms.list(), [{ ...room, name: 'Stale' }]);

    applyRoomJoined(queryClient, { roomId: room.id, room: { ...room, name: 'General refreshed' } });

    expect(queryClient.getQueryData(queryKeys.rooms.detail(room.id))).toMatchObject({
      name: 'General refreshed',
    });
    expect(queryClient.getQueryData<RoomResponse[]>(queryKeys.rooms.list())?.[0]?.name).toBe(
      'General refreshed',
    );
  });

  it('patches reaction changes onto the cached message', () => {
    const queryClient = new QueryClient();
    const existing = message();
    queryClient.setQueryData<MessagesInfiniteData>(queryKeys.messages.list(existing.roomId), {
      pageParams: [undefined],
      pages: [{ items: [existing] }],
    });

    applyReactionChanged(queryClient, {
      roomId: existing.roomId,
      emoji: '👍',
      userId: '507f1f77bcf86cd799439012',
      message: {
        ...existing,
        reactions: [{ emoji: '👍', count: 1, reactedByCurrentUser: false }],
      },
    });

    const next = queryClient.getQueryData<MessagesInfiniteData>(
      queryKeys.messages.list(existing.roomId),
    );
    expect(next?.pages[0]?.items[0]?.reactions).toEqual([
      { emoji: '👍', count: 1, reactedByCurrentUser: false },
    ]);
  });
});
