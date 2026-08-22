import { useAuth } from '../../hooks/useAuth';
import { useIsUserOnline } from '../../hooks/usePresence';
import { presenceLabel } from '../../lib/presence-display';
import type { PublicUserProfile } from '@pulse-chat/shared';

interface PresenceIndicatorProps {
  readonly userId: string;
  readonly authors: ReadonlyMap<string, PublicUserProfile>;
  readonly showLabel?: boolean;
}

export function PresenceIndicator({ userId, authors, showLabel = false }: PresenceIndicatorProps) {
  const { user } = useAuth();
  const isOnline = useIsUserOnline(userId);
  const profile = authors.get(userId);
  const isSelf = user?.id === userId;

  if (isSelf) {
    return null;
  }

  const label = presenceLabel(isOnline, profile?.lastSeenAt);

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={
          isOnline
            ? 'h-2 w-2 rounded-full bg-emerald-500'
            : 'h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600'
        }
      />
      {showLabel ? (
        <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </span>
  );
}
