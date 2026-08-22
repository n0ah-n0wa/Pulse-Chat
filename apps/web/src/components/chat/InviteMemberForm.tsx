import { useMemo, useState } from 'react';

import type { RoomResponse } from '@pulse-chat/shared';

import { useAddRoomMember } from '../../hooks/useRoomMutations';
import { useUsersSearchQuery } from '../../hooks/useUsersSearchQuery';
import { toDisplayErrorMessage } from '../../lib/errors';
import { canInviteToRoom } from '../../lib/room-search';
import { UserActionMenu } from './UserActionMenu';

interface InviteMemberFormProps {
  readonly room: RoomResponse;
  readonly memberUserIds: readonly string[];
}

export function InviteMemberForm({ room, memberUserIds }: InviteMemberFormProps) {
  const [query, setQuery] = useState('');
  const searchQuery = useUsersSearchQuery(query);
  const invite = useAddRoomMember(room.id);
  const memberIdSet = useMemo(() => new Set(memberUserIds), [memberUserIds]);

  if (!canInviteToRoom(room)) {
    return null;
  }

  const results = (searchQuery.data ?? []).filter((user) => !memberIdSet.has(user.id));
  const errorMessage =
    invite.error !== null && invite.error !== undefined
      ? toDisplayErrorMessage(invite.error, 'Unable to invite that user.')
      : searchQuery.isError
        ? toDisplayErrorMessage(searchQuery.error, 'User search is unavailable.')
        : undefined;

  return (
    <form
      className="mb-4 space-y-2 rounded-md border border-slate-200 p-3 dark:border-slate-800"
      aria-label="Invite a member"
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <label
        className="block text-xs font-medium text-slate-600 dark:text-slate-300"
        htmlFor={`invite-user-${room.id}`}
      >
        Invite by name
      </label>
      <input
        id={`invite-user-${room.id}`}
        type="search"
        value={query}
        autoComplete="off"
        placeholder="Search users…"
        onChange={(event) => {
          setQuery(event.target.value);
        }}
        className="block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
      />
      {errorMessage !== undefined ? (
        <p role="alert" className="text-xs text-rose-700 dark:text-rose-400">
          {errorMessage}
        </p>
      ) : null}
      {query.trim().length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Search for a username or display name to invite them to this room.
        </p>
      ) : null}
      {searchQuery.isFetching ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">Searching…</p>
      ) : null}
      {query.trim().length > 0 && !searchQuery.isFetching && results.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">No matching users to invite.</p>
      ) : null}
      {results.length > 0 ? (
        <ul className="space-y-1" aria-label="People to invite">
          {results.map((user) => (
            <li
              key={user.id}
              className="flex items-center justify-between gap-2 rounded-md px-1 py-1"
            >
              <div className="min-w-0">
                <UserActionMenu
                  userId={user.id}
                  username={user.username}
                  displayName={user.displayName}
                />
                <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
                  @{user.username}
                </span>
              </div>
              <button
                type="button"
                disabled={invite.isPending}
                onClick={() => {
                  invite.mutate(user.id, {
                    onSuccess: () => {
                      setQuery('');
                    },
                  });
                }}
                className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Invite
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
