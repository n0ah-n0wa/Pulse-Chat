import { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';

import { ROOM_TYPES } from '@pulse-chat/shared';

import { useAuthorProfiles } from '../../hooks/useAuthorProfiles';
import { useJoinRoom } from '../../hooks/useRoomMutations';
import { useRoomUnreadCounts } from '../../hooks/useRoomUnreadCounts';
import { useRoomsQuery } from '../../hooks/useRoomsQuery';
import { useUsersSearchQuery } from '../../hooks/useUsersSearchQuery';
import { toDisplayErrorMessage } from '../../lib/errors';
import { roomDisplayName, roomTypeLabel } from '../../lib/room-display';
import { AvatarImage } from '../account/AvatarImage';
import { roomMatchesQuery } from '../../lib/room-search';
import { useRoomUiStore } from '../../store/room-ui-store';
import { CreateRoomForm } from './CreateRoomForm';
import { ListSkeleton, StatusPanel } from './StatusPanel';
import { UnreadBadge } from './UnreadBadge';
import { UserActionMenu } from './UserActionMenu';

interface RoomListProps {
  readonly onRoomSelected?: () => void;
}

export function RoomList({ onRoomSelected }: RoomListProps) {
  const roomsQuery = useRoomsQuery();
  const unreadCounts = useRoomUnreadCounts();
  const currentRoomId = useRoomUiStore((state) => state.currentRoomId);
  const joinRoom = useJoinRoom();
  const [query, setQuery] = useState('');
  const usersSearch = useUsersSearchQuery(query);

  const rooms = useMemo(() => roomsQuery.data ?? [], [roomsQuery.data]);
  const peerUserIds = useMemo(
    () =>
      rooms
        .map((room) => room.peerUserId)
        .filter((peerUserId): peerUserId is string => peerUserId !== undefined),
    [rooms],
  );
  const peers = useAuthorProfiles(peerUserIds);

  const filteredRooms = useMemo(() => {
    return rooms.filter((room) =>
      roomMatchesQuery(
        room,
        query,
        room.peerUserId !== undefined ? peers.get(room.peerUserId) : undefined,
      ),
    );
  }, [peers, query, rooms]);

  if (roomsQuery.isPending) {
    return <ListSkeleton label="Loading rooms" />;
  }

  if (roomsQuery.isError) {
    return (
      <StatusPanel
        title="Could not load rooms"
        message={toDisplayErrorMessage(roomsQuery.error, 'The room list is unavailable.')}
        action={
          <button
            type="button"
            onClick={() => {
              void roomsQuery.refetch();
            }}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
          >
            Retry
          </button>
        }
      />
    );
  }

  const trimmedQuery = query.trim();
  const people = usersSearch.data ?? [];

  return (
    <div>
      <CreateRoomForm />
      <div className="mb-4">
        <label
          className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300"
          htmlFor="directory-search"
        >
          Search rooms and people
        </label>
        <input
          id="directory-search"
          type="search"
          value={query}
          autoComplete="off"
          placeholder="Find a room or person…"
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          className="block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
        />
      </div>
      {rooms.length === 0 && trimmedQuery.length === 0 ? (
        <StatusPanel
          title="No rooms yet"
          message="Join or create a room to start a conversation. Rooms you can access will appear here."
        />
      ) : (
        <nav aria-label="Rooms">
          {trimmedQuery.length > 0 && filteredRooms.length === 0 ? (
            <p className="mb-3 px-1 text-xs text-slate-500 dark:text-slate-400">
              No matching rooms.
            </p>
          ) : (
            <ul className="space-y-1">
              {filteredRooms.map((room) => {
                const selected = currentRoomId === room.id;
                const unread = unreadCounts.get(room.id) ?? 0;
                const canJoin =
                  room.type === ROOM_TYPES.PUBLIC && room.currentUserRole === undefined;
                const peer = room.peerUserId !== undefined ? peers.get(room.peerUserId) : undefined;

                return (
                  <li key={room.id}>
                    <div className="flex items-center gap-1">
                      <NavLink
                        to={`/app/rooms/${room.id}`}
                        aria-current={selected ? 'page' : undefined}
                        onClick={onRoomSelected}
                        className={({ isActive }) =>
                          [
                            'flex min-w-0 flex-1 items-center gap-2 rounded-md px-3 py-2 text-sm transition',
                            isActive || selected
                              ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                              : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800',
                          ].join(' ')
                        }
                      >
                        {room.type === ROOM_TYPES.DIRECT ? (
                          <AvatarImage
                            displayName={roomDisplayName(room, peer)}
                            avatarUrl={peer?.avatarUrl}
                            size="sm"
                          />
                        ) : null}
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{roomDisplayName(room, peer)}</span>
                          <span
                            className={
                              selected
                                ? 'mt-0.5 block text-xs opacity-80'
                                : 'mt-0.5 block text-xs text-slate-500 dark:text-slate-400'
                            }
                          >
                            {roomTypeLabel(room)}
                          </span>
                        </span>
                        <UnreadBadge count={unread} />
                      </NavLink>
                      {canJoin ? (
                        <button
                          type="button"
                          disabled={joinRoom.isPending}
                          aria-label={`Join ${roomDisplayName(room, peer)}`}
                          onClick={() => {
                            joinRoom.mutate(room.id, {
                              onSuccess: () => {
                                onRoomSelected?.();
                              },
                            });
                          }}
                          className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Join
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>
      )}
      {trimmedQuery.length > 0 ? (
        <section className="mt-4" aria-label="People">
          <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            People
          </h3>
          {usersSearch.isError ? (
            <p className="px-1 text-xs text-rose-700 dark:text-rose-400">
              {toDisplayErrorMessage(usersSearch.error, 'People search is unavailable.')}
            </p>
          ) : null}
          {usersSearch.isFetching ? (
            <p className="px-1 text-xs text-slate-500 dark:text-slate-400">Searching people…</p>
          ) : null}
          {!usersSearch.isFetching && !usersSearch.isError && people.length === 0 ? (
            <p className="px-1 text-xs text-slate-500 dark:text-slate-400">No matching people.</p>
          ) : null}
          {people.length > 0 ? (
            <ul className="space-y-1">
              {people.map((person) => (
                <li
                  key={person.id}
                  className="rounded-md px-3 py-2 text-sm text-slate-700 dark:text-slate-200"
                >
                  <UserActionMenu
                    userId={person.id}
                    username={person.username}
                    displayName={person.displayName}
                  />
                  <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                    @{person.username}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
