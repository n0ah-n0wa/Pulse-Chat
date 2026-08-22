import type { QueryClient } from '@tanstack/react-query';

import type {
  MessageResponse,
  NotificationListResponse,
  NotificationNewEvent,
  PublicUserProfile,
  ReactionChangedEvent,
  RoomJoinedEvent,
  RoomResponse,
  UserOfflineEvent,
  UserOnlineEvent,
} from '@pulse-chat/shared';

import {
  hasMessageInPages,
  mergePendingOptimisticMessages,
  replaceMessageInPages,
  upsertMessageInPages,
  type MessagesInfiniteData,
} from './message-cache';
import { prependNotification } from './notification-cache';
import { queryKeys } from './query-keys';
import { getRealtimeCurrentUserId } from './realtime-sync-context';
import { applyUserOffline, applyUserOnline, usePresenceStore } from '../store/presence-store';
import { useRoomUiStore } from '../store/room-ui-store';
import { useUnreadStore } from '../store/unread-store';

export function applyMessageNew(queryClient: QueryClient, message: MessageResponse): void {
  const queryKey = queryKeys.messages.list(message.roomId);
  const previous = queryClient.getQueryData<MessagesInfiniteData>(queryKey);
  const alreadyPresent = hasMessageInPages(previous, message);
  const hadCache = previous !== undefined;

  if (hadCache) {
    queryClient.setQueryData<MessagesInfiniteData>(queryKey, (current) =>
      upsertMessageInPages(current, message),
    );
  }

  if (alreadyPresent) {
    return;
  }

  const activeRoomId = useRoomUiStore.getState().currentRoomId;
  const currentUserId = getRealtimeCurrentUserId();
  if (message.roomId === activeRoomId || message.authorId === currentUserId) {
    return;
  }

  if (!hadCache) {
    useUnreadStore.getState().increment(message.roomId);
  }
}

export function applyMessageUpdated(queryClient: QueryClient, message: MessageResponse): void {
  queryClient.setQueryData<MessagesInfiniteData>(
    queryKeys.messages.list(message.roomId),
    (current) => replaceMessageInPages(current, message),
  );
}

export function applyMessageDeleted(queryClient: QueryClient, message: MessageResponse): void {
  applyMessageUpdated(queryClient, message);
}

export function applyReactionChanged(
  queryClient: QueryClient,
  payload: ReactionChangedEvent,
): void {
  queryClient.setQueryData<MessagesInfiniteData>(
    queryKeys.messages.list(payload.roomId),
    (current) => replaceMessageInPages(current, payload.message),
  );
}

export function applyUserPresence(
  queryClient: QueryClient,
  payload: UserOnlineEvent | UserOfflineEvent,
  online: boolean,
): void {
  if (online) {
    applyUserOnline(payload.userId);
  } else {
    applyUserOffline(payload.userId);
  }

  queryClient.setQueryData<PublicUserProfile>(queryKeys.users.profile(payload.userId), (current) =>
    current === undefined
      ? current
      : {
          ...current,
          lastSeenAt: payload.lastSeenAt,
        },
  );
}

export function applyNotificationNew(
  queryClient: QueryClient,
  payload: NotificationNewEvent,
): void {
  queryClient.setQueryData<NotificationListResponse>(queryKeys.notifications.list(), (current) =>
    prependNotification(current, payload.notification),
  );
}

export function applyRoomJoined(queryClient: QueryClient, payload: RoomJoinedEvent): void {
  queryClient.setQueryData(queryKeys.rooms.detail(payload.roomId), payload.room);
  queryClient.setQueryData<RoomResponse[]>(queryKeys.rooms.list(), (current) => {
    if (current === undefined) {
      return current;
    }

    const index = current.findIndex((room) => room.id === payload.roomId);
    if (index < 0) {
      return [...current, payload.room];
    }

    const next = current.slice();
    next[index] = payload.room;
    return next;
  });
  void queryClient.invalidateQueries({ queryKey: queryKeys.rooms.members(payload.roomId) });
}

export function applyRoomLeft(queryClient: QueryClient, roomId: string): void {
  queryClient.removeQueries({ queryKey: queryKeys.messages.list(roomId) });
  queryClient.removeQueries({ queryKey: queryKeys.rooms.detail(roomId) });
  queryClient.removeQueries({ queryKey: queryKeys.rooms.members(roomId) });
  useUnreadStore.getState().clear(roomId);
  void queryClient.invalidateQueries({ queryKey: queryKeys.rooms.list() });
}

/**
 * Refreshes potentially stale client state after a socket reconnect
 * (specification section 38): active room, recent messages, presence, unread.
 */
export async function refreshAfterReconnect(
  queryClient: QueryClient,
  roomIds: readonly string[],
): Promise<void> {
  useUnreadStore.getState().reset();
  usePresenceStore.getState().resetPresence();

  const rooms = new Set(roomIds);
  const activeRoomId = useRoomUiStore.getState().currentRoomId;
  if (activeRoomId !== null && activeRoomId.length > 0) {
    rooms.add(activeRoomId);
  }

  const previousByRoom = new Map<string, MessagesInfiniteData | undefined>();
  for (const roomId of rooms) {
    previousByRoom.set(
      roomId,
      queryClient.getQueryData<MessagesInfiniteData>(queryKeys.messages.list(roomId)),
    );
  }

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.rooms.list() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list() }),
    ...[...rooms].flatMap((roomId) => [
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.detail(roomId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms.members(roomId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.messages.list(roomId) }),
    ]),
  ]);

  for (const [roomId, previous] of previousByRoom) {
    const fetched = queryClient.getQueryData<MessagesInfiniteData>(queryKeys.messages.list(roomId));
    const merged = mergePendingOptimisticMessages(fetched, previous);
    if (merged !== undefined) {
      queryClient.setQueryData(queryKeys.messages.list(roomId), merged);
    }
  }
}

/** @deprecated Prefer {@link refreshAfterReconnect}. */
export function invalidateRoomAfterReconnect(
  queryClient: QueryClient,
  roomIds: readonly string[],
): void {
  void refreshAfterReconnect(queryClient, roomIds);
}
