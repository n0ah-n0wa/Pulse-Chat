import type {
  AddReactionInput,
  CreateMessageInput,
  ListMessagesQuery,
  MessageListResponse,
  MessageResponse,
  UpdateMessageInput,
} from '@pulse-chat/shared';
import { MESSAGE_PAGE_SIZE_DEFAULT } from '@pulse-chat/shared';

import { apiClient } from './api-client';

function toQueryString(query: ListMessagesQuery): string {
  const params = new URLSearchParams();
  if (query.limit !== undefined) {
    params.set('limit', String(query.limit));
  }
  if (query.before !== undefined) {
    params.set('before', query.before);
  }
  const value = params.toString();
  return value.length > 0 ? `?${value}` : '';
}

export const messagesService = {
  list(
    roomId: string,
    query: ListMessagesQuery = { limit: MESSAGE_PAGE_SIZE_DEFAULT },
  ): Promise<MessageListResponse> {
    return apiClient.get<MessageListResponse>(
      `/api/rooms/${roomId}/messages${toQueryString(query)}`,
    );
  },

  create(roomId: string, input: CreateMessageInput): Promise<MessageResponse> {
    return apiClient.post<MessageResponse>(`/api/rooms/${roomId}/messages`, input);
  },

  update(messageId: string, input: UpdateMessageInput): Promise<MessageResponse> {
    return apiClient.patch<MessageResponse>(`/api/messages/${messageId}`, input);
  },

  delete(messageId: string): Promise<void> {
    return apiClient.delete<void>(`/api/messages/${messageId}`);
  },

  toggleReaction(messageId: string, input: AddReactionInput): Promise<MessageResponse> {
    return apiClient.post<MessageResponse>(`/api/messages/${messageId}/reactions`, input);
  },

  removeReaction(messageId: string, emoji: string): Promise<MessageResponse> {
    return apiClient.delete<MessageResponse>(
      `/api/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
    );
  },
};
