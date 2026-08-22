import { useCallback, useMemo, useState } from 'react';

import { ROOM_TYPES, type MessageResponse } from '@pulse-chat/shared';

import { useAuth } from '../../hooks/useAuth';
import { useAuthorProfiles } from '../../hooks/useAuthorProfiles';
import {
  useDeleteMessage,
  useEditMessage,
  useSendMessage,
  useToggleReaction,
} from '../../hooks/useMessageMutations';
import { useRoomMessagesQuery } from '../../hooks/useRoomMessagesQuery';
import { useRoomQuery } from '../../hooks/useRoomsQuery';
import { useMarkRoomReadWhenViewing } from '../../hooks/useMarkRoomReadWhenViewing';
import { useRoomSubscription } from '../../hooks/useRoomSubscription';
import { useRoomTypingUsers } from '../../hooks/useRoomTypingUsers';
import { useSocketConnectionState } from '../../hooks/useSocketConnectionState';
import { toDisplayErrorMessage } from '../../lib/errors';
import { createClientMessageId } from '../../lib/message-utils';
import { roomDisplayName, roomTypeLabel } from '../../lib/room-display';
import { AvatarImage } from '../account/AvatarImage';
import { ConnectionBanner } from './ConnectionBanner';
import { MessageComposer } from './MessageComposer';
import { MessageList } from './MessageList';
import { StatusPanel } from './StatusPanel';
import { TypingIndicator } from './TypingIndicator';

interface ChatPaneProps {
  readonly roomId?: string;
}

export function ChatPane({ roomId }: ChatPaneProps) {
  const roomQuery = useRoomQuery(roomId);
  const {
    messages,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
    isPending,
    isError,
    error,
  } = useRoomMessagesQuery(roomId);
  const connectionState = useSocketConnectionState();
  const { user } = useAuth();
  const [replyTo, setReplyTo] = useState<MessageResponse | null>(null);
  const [composerError, setComposerError] = useState<string | undefined>(undefined);

  useRoomSubscription(roomId);

  const latestMessageId = messages.at(-1)?.id;
  useMarkRoomReadWhenViewing(roomId, latestMessageId, !isPending && messages.length > 0);

  const sendMessage = useSendMessage(roomId ?? '', user?.id);
  const { mutate: toggleReaction } = useToggleReaction(roomId ?? '');
  const { mutate: editMessage } = useEditMessage(roomId ?? '');
  const { mutate: deleteMessage } = useDeleteMessage(roomId ?? '');
  const typingUserIds = useRoomTypingUsers(roomId, user?.id);

  const handleLoadOlder = useCallback(() => {
    if (hasNextPage === true && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const handleReply = useCallback((message: MessageResponse) => {
    setReplyTo(message);
    setComposerError(undefined);
  }, []);

  const handleToggleReaction = useCallback(
    (messageId: string, emoji: string) => {
      toggleReaction({ messageId, emoji });
    },
    [toggleReaction],
  );

  const handleEdit = useCallback(
    (messageId: string, content: string) => {
      editMessage({ messageId, content });
    },
    [editMessage],
  );

  const handleDelete = useCallback(
    (messageId: string) => {
      deleteMessage(messageId);
    },
    [deleteMessage],
  );

  const authorIds = useMemo(() => {
    const ids = messages.map((message) => message.authorId);
    for (const message of messages) {
      if (message.replyTo !== undefined) {
        ids.push(message.replyTo.authorId);
      }
    }
    for (const typingUserId of typingUserIds) {
      ids.push(typingUserId);
    }
    if (replyTo !== null) {
      ids.push(replyTo.authorId);
    }
    if (roomQuery.data?.peerUserId !== undefined) {
      ids.push(roomQuery.data.peerUserId);
    }
    if (user?.id !== undefined) {
      ids.push(user.id);
    }
    return ids;
  }, [messages, replyTo, roomQuery.data, typingUserIds, user]);

  const authors = useAuthorProfiles(authorIds);

  const offline =
    connectionState === 'disconnected' ||
    connectionState === 'reconnecting' ||
    connectionState === 'authentication_failed';

  if (roomId === undefined) {
    return (
      <StatusPanel
        title="Select a room"
        message="Pick a conversation from the room list to open the chat."
      />
    );
  }

  if (roomQuery.isPending) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-slate-200 px-4 py-4 dark:border-slate-800">
          <div className="h-5 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          <div className="mt-2 h-3 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading room…</p>
        </div>
      </div>
    );
  }

  if (roomQuery.isError || roomQuery.data === undefined) {
    return (
      <StatusPanel
        title="Room unavailable"
        message={toDisplayErrorMessage(roomQuery.error, 'This room could not be opened.')}
        action={
          <button
            type="button"
            onClick={() => {
              void roomQuery.refetch();
            }}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
          >
            Retry
          </button>
        }
      />
    );
  }

  const room = roomQuery.data;
  const peer = room.peerUserId !== undefined ? authors.get(room.peerUserId) : undefined;

  return (
    <section className="flex h-full min-h-0 flex-col" aria-labelledby="chat-room-heading">
      <header className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center gap-3">
          {room.type === ROOM_TYPES.DIRECT ? (
            <AvatarImage
              displayName={roomDisplayName(room, peer)}
              avatarUrl={peer?.avatarUrl}
              size="sm"
            />
          ) : null}
          <div className="min-w-0">
            <h1
              id="chat-room-heading"
              className="text-lg font-semibold text-slate-900 dark:text-slate-50"
            >
              {roomDisplayName(room, peer)}
            </h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {roomTypeLabel(room)}
              {room.description !== undefined && room.description.length > 0
                ? ` · ${room.description}`
                : ''}
            </p>
          </div>
        </div>
      </header>

      <ConnectionBanner connectionState={connectionState} />

      <MessageList
        messages={messages}
        authors={authors}
        currentUserId={user?.id}
        isLoading={isPending}
        isFetchingOlder={isFetchingNextPage}
        hasOlder={hasNextPage === true}
        errorMessage={
          isError ? toDisplayErrorMessage(error, 'Message history is unavailable.') : undefined
        }
        onLoadOlder={handleLoadOlder}
        onRetry={handleRetry}
        onReply={handleReply}
        onToggleReaction={handleToggleReaction}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      <TypingIndicator typingUserIds={typingUserIds} authors={authors} />

      <MessageComposer
        roomId={roomId}
        disabled={offline}
        sending={sendMessage.isPending}
        errorMessage={composerError}
        replyTo={replyTo}
        authors={authors}
        currentUserId={user?.id}
        onCancelReply={() => {
          setReplyTo(null);
        }}
        onSend={(content) => {
          setComposerError(undefined);
          sendMessage.mutate(
            {
              content,
              clientMessageId: createClientMessageId(),
              ...(replyTo !== null ? { replyToMessageId: replyTo.id } : {}),
            },
            {
              onSuccess: () => {
                setReplyTo(null);
              },
              onError: (error) => {
                setComposerError(toDisplayErrorMessage(error, 'Unable to send message.'));
              },
            },
          );
        }}
      />
    </section>
  );
}
