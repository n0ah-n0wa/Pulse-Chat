import type {
  ListNotificationsQuery,
  NotificationListResponse,
  NotificationResponse,
} from '@pulse-chat/shared';
import { NOTIFICATION_PAGE_SIZE_DEFAULT } from '@pulse-chat/shared';

import { apiClient } from './api-client';

function toQueryString(query: ListNotificationsQuery): string {
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

export const notificationsService = {
  list(
    query: ListNotificationsQuery = { limit: NOTIFICATION_PAGE_SIZE_DEFAULT },
  ): Promise<NotificationListResponse> {
    return apiClient.get<NotificationListResponse>(`/api/notifications${toQueryString(query)}`);
  },

  markRead(notificationId: string): Promise<NotificationResponse> {
    return apiClient.post<NotificationResponse>(`/api/notifications/${notificationId}/read`);
  },

  markAllRead(): Promise<void> {
    return apiClient.post<void>('/api/notifications/read-all');
  },
};
