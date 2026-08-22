import { NavLink } from 'react-router-dom';

import { ROOM_TYPES } from '@pulse-chat/shared';

import { useJoinRoom } from '../../hooks/useRoomMutations';
import { useRoomUnreadCounts } from '../../hooks/useRoomUnreadCounts';
import { useRoomsQuery } from '../../hooks/useRoomsQuery';
import { toDisplayErrorMessage } from '../../lib/errors';
import { roomDisplayName, roomTypeLabel } from '../../lib/room-display';
import { useRoomUiStore } from '../../store/room-ui-store';
import { CreateRoomForm } from './CreateRoomForm';
import { ListSkeleton, StatusPanel } from './StatusPanel';
import { UnreadBadge } from './UnreadBadge';

interface RoomListProps {
  readonly onRoomSelected?: () => void;
}

export function RoomList({ onRoomSelected }: RoomListProps) {
  const roomsQuery = useRoomsQuery();
  const unreadCounts = useRoomUnreadCounts();
  const currentRoomId = useRoomUiStore((state) => state.currentRoomId);
  const joinRoom = useJoinRoom();

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

  const rooms = roomsQuery.data ?? [];

  return (
    <div>
      <CreateRoomForm />
      {rooms.length === 0 ? (
        <StatusPanel
          title="No rooms yet"
          message="Join or create a room to start a conversation. Rooms you can access will appear here."
        />
      ) : (
        <nav aria-label="Rooms">
          <ul className="space-y-1">
            {rooms.map((room) => {
              const selected = currentRoomId === room.id;
              const unread = unreadCounts.get(room.id) ?? 0;
              const canJoin = room.type === ROOM_TYPES.PUBLIC && room.currentUserRole === undefined;

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
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{roomDisplayName(room)}</span>
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
                        aria-label={`Join ${roomDisplayName(room)}`}
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
        </nav>
      )}
    </div>
  );
}
