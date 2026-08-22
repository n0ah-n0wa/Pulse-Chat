import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';

import { MESSAGE_PAGE_SIZE_DEFAULT, type MessageListResponse } from '@pulse-chat/shared';

import { flattenMessagesChronological } from '../lib/message-cache';
import { queryKeys } from '../lib/query-keys';
import { messagesService } from '../services/messages-service';

export function useRoomMessagesQuery(roomId: string | undefined) {
  const query = useInfiniteQuery<
    MessageListResponse,
    Error,
    InfiniteData<MessageListResponse, string | undefined>,
    readonly ['messages', 'list', string],
    string | undefined
  >({
    queryKey: queryKeys.messages.list(roomId ?? ''),
    queryFn: ({ pageParam }) =>
      messagesService.list(roomId ?? '', {
        limit: MESSAGE_PAGE_SIZE_DEFAULT,
        before: pageParam,
      }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: roomId !== undefined && roomId.length > 0,
  });

  return {
    ...query,
    messages: flattenMessagesChronological(query.data),
  };
}
