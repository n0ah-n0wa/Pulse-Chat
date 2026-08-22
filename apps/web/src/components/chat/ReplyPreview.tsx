import type { MessageReplyReferenceResponse, PublicUserProfile } from '@pulse-chat/shared';

import { formatMessageTime } from '../../lib/message-utils';

interface ReplyPreviewProps {
  readonly reply: MessageReplyReferenceResponse;
  readonly authors: ReadonlyMap<string, PublicUserProfile>;
  readonly onScrollToMessage?: (messageId: string) => void;
}

export function ReplyPreview({ reply, authors, onScrollToMessage }: ReplyPreviewProps) {
  const author = authors.get(reply.authorId);
  const label = author?.displayName ?? author?.username ?? 'Unknown user';
  const deleted = reply.deletedAt !== undefined;

  return (
    <button
      type="button"
      disabled={onScrollToMessage === undefined}
      onClick={() => {
        onScrollToMessage?.(reply.id);
      }}
      className="mb-1 w-full rounded-md border-l-2 border-slate-400 bg-slate-100/80 px-2 py-1 text-left text-xs text-slate-600 disabled:cursor-default dark:border-slate-500 dark:bg-slate-800/80 dark:text-slate-300"
    >
      <span className="font-medium text-slate-800 dark:text-slate-100">{label}</span>
      <span className="ml-2 text-slate-500 dark:text-slate-400">
        {formatMessageTime(reply.createdAt)}
      </span>
      <span className="mt-0.5 block truncate">
        {deleted ? 'Original message was deleted' : reply.content}
      </span>
    </button>
  );
}
