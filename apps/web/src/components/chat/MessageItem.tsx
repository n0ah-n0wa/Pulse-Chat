import { memo, useState } from 'react';

import type { MessageResponse, PublicUserProfile } from '@pulse-chat/shared';
import { MESSAGE_MAX_LENGTH } from '@pulse-chat/shared';

import { formatMessageTime } from '../../lib/message-utils';
import { AttachmentPreview } from './AttachmentPreview';
import { MessageReactions } from './MessageReactions';
import { ReplyPreview } from './ReplyPreview';

interface MessageItemProps {
  readonly message: MessageResponse;
  readonly currentUserId: string | undefined;
  readonly authors: ReadonlyMap<string, PublicUserProfile>;
  readonly showAuthor: boolean;
  readonly showDaySeparator: boolean;
  readonly dayLabel: string;
  readonly onReply: (message: MessageResponse) => void;
  readonly onToggleReaction: (messageId: string, emoji: string) => void;
  readonly onEdit?: (messageId: string, content: string) => void;
  readonly onDelete?: (messageId: string) => void;
  readonly onScrollToMessage?: (messageId: string) => void;
  readonly highlighted?: boolean;
}

export const MessageItem = memo(function MessageItem({
  message,
  currentUserId,
  authors,
  showAuthor,
  showDaySeparator,
  dayLabel,
  onReply,
  onToggleReaction,
  onEdit,
  onDelete,
  onScrollToMessage,
  highlighted = false,
}: MessageItemProps) {
  const author = authors.get(message.authorId);
  const isOwn = currentUserId !== undefined && message.authorId === currentUserId;
  const authorLabel = isOwn
    ? 'You'
    : (author?.displayName ?? author?.username ?? message.authorId.slice(-6));
  const deleted = message.deletedAt !== undefined;
  const edited = message.editedAt !== undefined && !deleted;
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const canManage = isOwn && !deleted;

  return (
    <article
      id={`message-${message.id}`}
      data-message-id={message.id}
      aria-label={deleted ? 'Deleted message' : `Message from ${authorLabel}`}
      className={[
        'px-3 py-0.5',
        showAuthor ? 'mt-3' : 'mt-0.5',
        highlighted ? 'rounded-md bg-amber-50 dark:bg-amber-950/40' : '',
      ].join(' ')}
    >
      {showDaySeparator ? (
        <div className="mb-3 flex items-center gap-3" role="separator" aria-label={dayLabel}>
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{dayLabel}</span>
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
        </div>
      ) : null}

      <div className="group flex gap-2">
        <div className="w-10 shrink-0 pt-0.5 text-right">
          {showAuthor ? (
            <span
              aria-hidden="true"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-100"
            >
              {authorLabel.slice(0, 1).toUpperCase()}
            </span>
          ) : (
            <span className="invisible text-[10px] text-slate-400 group-hover:visible">
              {formatMessageTime(message.createdAt)}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {showAuthor ? (
            <div className="mb-0.5 flex flex-wrap items-baseline gap-2">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                {authorLabel}
              </span>
              <time
                dateTime={message.createdAt}
                className="text-xs text-slate-500 dark:text-slate-400"
              >
                {formatMessageTime(message.createdAt)}
              </time>
            </div>
          ) : null}

          {message.replyTo !== undefined ? (
            <ReplyPreview
              reply={message.replyTo}
              authors={authors}
              onScrollToMessage={onScrollToMessage}
            />
          ) : null}

          {deleted ? (
            <p className="text-sm italic text-slate-500 dark:text-slate-400">Message deleted</p>
          ) : isEditing ? (
            <form
              className="space-y-2"
              aria-label="Edit message"
              onSubmit={(event) => {
                event.preventDefault();
                const next = draft.trim();
                if (next.length === 0 || onEdit === undefined) {
                  return;
                }
                onEdit(message.id, next);
                setIsEditing(false);
              }}
            >
              <label className="sr-only" htmlFor={`edit-message-${message.id}`}>
                Edited message
              </label>
              <textarea
                id={`edit-message-${message.id}`}
                value={draft}
                maxLength={MESSAGE_MAX_LENGTH}
                onChange={(event) => {
                  setDraft(event.target.value);
                }}
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="text-xs font-medium text-slate-700 hover:text-slate-900 dark:text-slate-200"
                >
                  Save
                </button>
                <button
                  type="button"
                  className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400"
                  onClick={() => {
                    setDraft(message.content);
                    setIsEditing(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <p className="whitespace-pre-wrap break-words text-sm text-slate-800 dark:text-slate-100">
                {message.content}
                {edited ? (
                  <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">(edited)</span>
                ) : null}
              </p>
              <AttachmentPreview attachments={message.attachments} />
              <MessageReactions
                reactions={message.reactions}
                onToggle={(emoji) => {
                  onToggleReaction(message.id, emoji);
                }}
              />
            </>
          )}

          {!deleted && !isEditing ? (
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                onClick={() => {
                  onReply(message);
                }}
              >
                Reply
              </button>
              {canManage && onEdit !== undefined ? (
                <button
                  type="button"
                  className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                  onClick={() => {
                    setDraft(message.content);
                    setIsEditing(true);
                  }}
                >
                  Edit
                </button>
              ) : null}
              {canManage && onDelete !== undefined ? (
                <button
                  type="button"
                  className="text-xs font-medium text-rose-600 hover:text-rose-800 dark:text-rose-400"
                  onClick={() => {
                    onDelete(message.id);
                  }}
                >
                  Delete
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
});
