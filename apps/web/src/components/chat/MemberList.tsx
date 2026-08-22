import { useMemo } from 'react';

import { useRoomMembersQuery } from '../../hooks/useRoomMembersQuery';
import { useAuthorProfiles } from '../../hooks/useAuthorProfiles';
import { toDisplayErrorMessage } from '../../lib/errors';
import { PresenceIndicator } from './PresenceIndicator';
import { ListSkeleton, StatusPanel } from './StatusPanel';

interface MemberListProps {
  readonly roomId: string | undefined;
}

export function MemberList({ roomId }: MemberListProps) {
  const membersQuery = useRoomMembersQuery(roomId);

  const authorIds = useMemo(
    () => (membersQuery.data ?? []).map((member) => member.userId),
    [membersQuery.data],
  );
  const authors = useAuthorProfiles(authorIds);

  if (roomId === undefined) {
    return (
      <StatusPanel
        title="No room selected"
        message="Choose a room to see who is a member of the conversation."
      />
    );
  }

  if (membersQuery.isPending) {
    return <ListSkeleton label="Loading members" rows={4} />;
  }

  if (membersQuery.isError) {
    return (
      <StatusPanel
        title="Could not load members"
        message={toDisplayErrorMessage(membersQuery.error, 'Member information is unavailable.')}
        action={
          <button
            type="button"
            onClick={() => {
              void membersQuery.refetch();
            }}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
          >
            Retry
          </button>
        }
      />
    );
  }

  const members = membersQuery.data ?? [];
  if (members.length === 0) {
    return <StatusPanel title="No members" message="This room does not have any members yet." />;
  }

  return (
    <ul aria-label="Room members" className="space-y-1">
      {members.map((member) => {
        const profile = authors.get(member.userId);
        const displayName = profile?.displayName ?? profile?.username ?? member.userId.slice(-6);

        return (
          <li
            key={member.id}
            className="rounded-md px-3 py-2 text-sm text-slate-700 dark:text-slate-200"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">{displayName}</span>
              <PresenceIndicator userId={member.userId} authors={authors} showLabel />
            </div>
            <span className="mt-0.5 block text-xs capitalize text-slate-500 dark:text-slate-400">
              {member.role.toLowerCase()}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
