import type { PublicUserProfile } from '@pulse-chat/shared';

interface TypingIndicatorProps {
  readonly typingUserIds: readonly string[];
  readonly authors: ReadonlyMap<string, PublicUserProfile>;
}

function labelFor(authors: ReadonlyMap<string, PublicUserProfile>, userId: string): string {
  const profile = authors.get(userId);
  return profile?.displayName ?? profile?.username ?? 'Someone';
}

export function TypingIndicator({ typingUserIds, authors }: TypingIndicatorProps) {
  if (typingUserIds.length === 0) {
    return null;
  }

  const names = typingUserIds.map((userId) => labelFor(authors, userId));
  let message = `${names[0] ?? 'Someone'} is typing…`;
  if (names.length === 2) {
    message = `${names[0]} and ${names[1]} are typing…`;
  } else if (names.length > 2) {
    message = 'Several people are typing…';
  }

  return (
    <p
      role="status"
      aria-live="polite"
      className="border-t border-slate-100 px-4 py-1 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400"
    >
      {message}
    </p>
  );
}
