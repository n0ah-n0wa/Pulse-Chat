import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { CreateMessageInput, MessageResponse } from '@pulse-chat/shared';

import {
  replaceMessageInPages,
  upsertMessageInPages,
  type MessagesInfiniteData,
} from '../lib/message-cache';
import { queryKeys } from '../lib/query-keys';
import { optimisticMessageIdForClient } from '../lib/message-utils';
import { messagesService } from '../services/messages-service';

interface SendContext {
  readonly previous: MessagesInfiniteData | undefined;
  readonly clientMessageId: string;
}

export function useSendMessage(roomId: string, authorId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateMessageInput) => messagesService.create(roomId, input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.messages.list(roomId) });
      const previous = queryClient.getQueryData<MessagesInfiniteData>(
        queryKeys.messages.list(roomId),
      );

      if (authorId !== undefined) {
        const optimistic: MessageResponse = {
          id: optimisticMessageIdForClient(input.clientMessageId),
          roomId,
          authorId,
          content: input.content,
          clientMessageId: input.clientMessageId,
          attachments: [],
          reactions: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...(input.replyToMessageId !== undefined
            ? { replyToMessageId: input.replyToMessageId }
            : {}),
        };

        queryClient.setQueryData<MessagesInfiniteData>(queryKeys.messages.list(roomId), (current) =>
          upsertMessageInPages(current, optimistic),
        );
      }

      return { previous, clientMessageId: input.clientMessageId } satisfies SendContext;
    },
    onSuccess: (message) => {
      queryClient.setQueryData<MessagesInfiniteData>(queryKeys.messages.list(roomId), (current) =>
        upsertMessageInPages(current, message),
      );
    },
    onError: (_error, input, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKeys.messages.list(roomId), context.previous);
        return;
      }

      queryClient.setQueryData<MessagesInfiniteData>(queryKeys.messages.list(roomId), (current) => {
        if (current === undefined) {
          return current;
        }

        return {
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            items: page.items.filter((item) => item.clientMessageId !== input.clientMessageId),
          })),
        };
      });
    },
  });
}

export function useToggleReaction(roomId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ messageId, emoji }: { readonly messageId: string; readonly emoji: string }) =>
      messagesService.toggleReaction(messageId, { emoji }),
    onSuccess: (message: MessageResponse) => {
      queryClient.setQueryData<MessagesInfiniteData>(queryKeys.messages.list(roomId), (current) =>
        replaceMessageInPages(current, message),
      );
    },
  });
}

export function useEditMessage(roomId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      messageId,
      content,
    }: {
      readonly messageId: string;
      readonly content: string;
    }) => messagesService.update(messageId, { content }),
    onSuccess: (message: MessageResponse) => {
      queryClient.setQueryData<MessagesInfiniteData>(queryKeys.messages.list(roomId), (current) =>
        replaceMessageInPages(current, message),
      );
    },
  });
}

export function useDeleteMessage(roomId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (messageId: string) => messagesService.delete(messageId),
    onSuccess: (_void, messageId) => {
      queryClient.setQueryData<MessagesInfiniteData>(queryKeys.messages.list(roomId), (current) => {
        if (current === undefined) {
          return current;
        }

        return {
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            items: page.items.map((item) =>
              item.id === messageId
                ? {
                    ...item,
                    content: '',
                    attachments: [],
                    deletedAt: item.deletedAt ?? new Date().toISOString(),
                  }
                : item,
            ),
          })),
        };
      });
    },
  });
}
