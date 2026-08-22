import { useVirtualizer } from '@tanstack/react-virtual';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type UIEvent,
} from 'react';

import type { MessageResponse, PublicUserProfile } from '@pulse-chat/shared';

import { formatMessageDay, shouldGroupWithPrevious } from '../../lib/message-utils';
import { MessageItem } from './MessageItem';
import { StatusPanel } from './StatusPanel';

interface MessageListProps {
  readonly messages: readonly MessageResponse[];
  readonly authors: ReadonlyMap<string, PublicUserProfile>;
  readonly currentUserId: string | undefined;
  readonly isLoading: boolean;
  readonly isFetchingOlder: boolean;
  readonly hasOlder: boolean;
  readonly errorMessage?: string;
  readonly onLoadOlder: () => void;
  readonly onRetry: () => void;
  readonly onReply: (message: MessageResponse) => void;
  readonly onToggleReaction: (messageId: string, emoji: string) => void;
  readonly onEdit?: (messageId: string, content: string) => void;
  readonly onDelete?: (messageId: string) => void;
  readonly scrollToMessageId?: string | null;
  readonly onScrollToMessageHandled?: () => void;
}

export function MessageList({
  messages,
  authors,
  currentUserId,
  isLoading,
  isFetchingOlder,
  hasOlder,
  errorMessage,
  onLoadOlder,
  onRetry,
  onReply,
  onToggleReaction,
  onEdit,
  onDelete,
  scrollToMessageId,
  onScrollToMessageHandled,
}: MessageListProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const lastMessageId = messages.at(-1)?.id;
  const stickToBottomRef = useRef(true);
  const previousCountRef = useRef(0);

  const dayLabels = useMemo(
    () => messages.map((message) => formatMessageDay(message.createdAt)),
    [messages],
  );

  // TanStack Virtual is the supported windowing API for large message lists.
  // eslint-disable-next-line react-hooks/incompatible-library -- returns unmemoizable helpers by design
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 88,
    overscan: 12,
    getItemKey: (index) => messages[index]?.id ?? index,
  });
  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;

  const handleScrollToMessage = useCallback(
    (messageId: string) => {
      const targetIndex = messages.findIndex((item) => item.id === messageId);
      if (targetIndex >= 0) {
        stickToBottomRef.current = false;
        virtualizerRef.current.scrollToIndex(targetIndex, { align: 'center' });
        setHighlightId(messageId);
      }
    },
    [messages],
  );

  const scrollToBottom = useCallback(() => {
    const element = parentRef.current;
    if (element === null) {
      return;
    }
    element.scrollTop = element.scrollHeight;
  }, []);

  useLayoutEffect(() => {
    const previousCount = previousCountRef.current;
    const nextCount = messages.length;

    if (nextCount === 0) {
      previousCountRef.current = 0;
      return;
    }

    if (previousCount === 0 || stickToBottomRef.current) {
      scrollToBottom();
    }

    previousCountRef.current = nextCount;
  }, [messages.length, lastMessageId, scrollToBottom]);

  useEffect(() => {
    if (scrollToMessageId === undefined || scrollToMessageId === null) {
      return;
    }

    const index = messages.findIndex((message) => message.id === scrollToMessageId);
    if (index < 0) {
      onScrollToMessageHandled?.();
      return;
    }

    stickToBottomRef.current = false;
    virtualizer.scrollToIndex(index, { align: 'center' });
    setHighlightId(scrollToMessageId);
    onScrollToMessageHandled?.();

    const timeout = globalThis.setTimeout(() => {
      setHighlightId(null);
    }, 1600);

    return () => {
      globalThis.clearTimeout(timeout);
    };
  }, [scrollToMessageId, messages, virtualizer, onScrollToMessageHandled]);

  const handleScroll = (event: UIEvent<HTMLDivElement>): void => {
    const target = event.currentTarget;
    const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 80;

    if (target.scrollTop < 80 && hasOlder && !isFetchingOlder) {
      const previousHeight = target.scrollHeight;
      onLoadOlder();
      requestAnimationFrame(() => {
        if (parentRef.current !== null) {
          parentRef.current.scrollTop =
            parentRef.current.scrollHeight - previousHeight + parentRef.current.scrollTop;
        }
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading messages…</p>
      </div>
    );
  }

  if (errorMessage !== undefined) {
    return (
      <StatusPanel
        title="Could not load messages"
        message={errorMessage}
        action={
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
          >
            Retry
          </button>
        }
      />
    );
  }

  if (messages.length === 0) {
    return (
      <StatusPanel
        title="No messages yet"
        message="Say hello to start the conversation. History will appear here as people chat."
      />
    );
  }

  const items = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      onScroll={handleScroll}
      className="min-h-0 flex-1 overflow-y-auto"
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      aria-label="Message history"
    >
      {isFetchingOlder ? (
        <p className="px-4 py-2 text-center text-xs text-slate-500 dark:text-slate-400">
          Loading earlier messages…
        </p>
      ) : null}
      <div
        className="relative w-full"
        style={{ height: `${String(virtualizer.getTotalSize())}px` }}
      >
        {items.map((virtualRow) => {
          const message = messages[virtualRow.index];
          if (message === undefined) {
            return null;
          }

          const previous = messages[virtualRow.index - 1];
          const showAuthor = previous === undefined || !shouldGroupWithPrevious(previous, message);
          const showDaySeparator =
            previous === undefined ||
            dayLabels[virtualRow.index] !== dayLabels[virtualRow.index - 1];

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${String(virtualRow.start)}px)` }}
            >
              <MessageItem
                message={message}
                currentUserId={currentUserId}
                authors={authors}
                showAuthor={showAuthor}
                showDaySeparator={showDaySeparator}
                dayLabel={dayLabels[virtualRow.index] ?? ''}
                highlighted={highlightId === message.id}
                onReply={onReply}
                onToggleReaction={onToggleReaction}
                onEdit={onEdit}
                onDelete={onDelete}
                onScrollToMessage={handleScrollToMessage}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
