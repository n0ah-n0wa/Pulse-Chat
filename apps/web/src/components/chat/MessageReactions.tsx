import type { MessageReactionResponse } from '@pulse-chat/shared';

import { QUICK_REACTIONS } from '../../lib/message-utils';

interface MessageReactionsProps {
  readonly reactions: readonly MessageReactionResponse[];
  readonly disabled?: boolean;
  readonly onToggle: (emoji: string) => void;
}

export function MessageReactions({ reactions, disabled = false, onToggle }: MessageReactionsProps) {
  const existing = new Set(reactions.map((reaction) => reaction.emoji));

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          disabled={disabled}
          aria-pressed={reaction.reactedByCurrentUser}
          aria-label={`${reaction.emoji} ${String(reaction.count)}`}
          onClick={() => {
            onToggle(reaction.emoji);
          }}
          className={
            reaction.reactedByCurrentUser
              ? 'rounded-full border border-slate-900 bg-slate-900 px-2 py-0.5 text-xs text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
              : 'rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
          }
        >
          <span aria-hidden="true">{reaction.emoji}</span>{' '}
          <span className="font-medium">{reaction.count}</span>
        </button>
      ))}
      <div className="flex flex-wrap gap-0.5" role="group" aria-label="Add reaction">
        {QUICK_REACTIONS.filter((emoji) => !existing.has(emoji)).map((emoji) => (
          <button
            key={emoji}
            type="button"
            disabled={disabled}
            aria-label={`React with ${emoji}`}
            onClick={() => {
              onToggle(emoji);
            }}
            className="rounded px-1.5 py-0.5 text-xs opacity-60 hover:bg-slate-100 hover:opacity-100 dark:hover:bg-slate-800"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
