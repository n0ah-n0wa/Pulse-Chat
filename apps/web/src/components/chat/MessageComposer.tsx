import { useEffect, useRef, type FormEvent, type KeyboardEvent } from 'react';

import type { MessageResponse, PublicUserProfile } from '@pulse-chat/shared';
import { MESSAGE_MAX_LENGTH } from '@pulse-chat/shared';

import { useTypingEmitter } from '../../hooks/useTypingEmitter';

interface MessageComposerProps {
  readonly roomId?: string;
  readonly disabled?: boolean;
  readonly sending?: boolean;
  readonly errorMessage?: string;
  readonly replyTo: MessageResponse | null;
  readonly authors: ReadonlyMap<string, PublicUserProfile>;
  readonly currentUserId: string | undefined;
  readonly onCancelReply: () => void;
  readonly onSend: (content: string) => void;
}

export function MessageComposer({
  roomId,
  disabled = false,
  sending = false,
  errorMessage,
  replyTo,
  authors,
  currentUserId,
  onCancelReply,
  onSend,
}: MessageComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { notifyTyping, stopTyping } = useTypingEmitter(roomId, !disabled && !sending);

  useEffect(() => {
    if (replyTo !== null) {
      textareaRef.current?.focus();
    }
  }, [replyTo]);

  const replyAuthor =
    replyTo === null
      ? undefined
      : currentUserId !== undefined && replyTo.authorId === currentUserId
        ? 'You'
        : (authors.get(replyTo.authorId)?.displayName ??
          authors.get(replyTo.authorId)?.username ??
          'Unknown user');

  const handleSubmit = (event?: FormEvent): void => {
    event?.preventDefault();
    const value = textareaRef.current?.value.trim() ?? '';
    if (value.length === 0 || disabled || sending) {
      return;
    }

    onSend(value);
    stopTyping();
    if (textareaRef.current !== null) {
      textareaRef.current.value = '';
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  return (
    <form
      className="border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
      onSubmit={handleSubmit}
      aria-label="Send a message"
    >
      {replyTo !== null ? (
        <div className="mb-2 flex items-start justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
              Replying to {replyAuthor}
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {replyTo.deletedAt !== undefined ? 'Message deleted' : replyTo.content}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="shrink-0 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-100"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {errorMessage !== undefined ? (
        <p role="alert" className="mb-2 text-sm text-rose-700 dark:text-rose-400">
          {errorMessage}
        </p>
      ) : null}

      <div className="flex items-end gap-2">
        <label className="sr-only" htmlFor="message-composer-input">
          Message
        </label>
        <textarea
          id="message-composer-input"
          ref={textareaRef}
          rows={1}
          maxLength={MESSAGE_MAX_LENGTH}
          disabled={disabled || sending}
          placeholder={disabled ? 'Reconnect to send messages' : 'Write a message'}
          onKeyDown={handleKeyDown}
          onChange={() => {
            notifyTyping();
          }}
          className="max-h-40 min-h-10 flex-1 resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50 dark:focus:ring-slate-700 dark:disabled:bg-slate-800"
        />
        <button
          type="submit"
          disabled={disabled || sending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-slate-100 dark:text-slate-900 dark:disabled:bg-slate-600"
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
        Enter to send · Shift+Enter for a new line
      </p>
    </form>
  );
}
