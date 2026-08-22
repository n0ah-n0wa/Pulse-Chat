import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { NotificationListResponse, NotificationResponse } from '@pulse-chat/shared';
import { NOTIFICATION_PAGE_SIZE_DEFAULT } from '@pulse-chat/shared';

import { patchNotificationReadState } from '../lib/notification-cache';
import { queryKeys } from '../lib/query-keys';
import { notificationsService } from '../services/notifications-service';

export function useNotificationsQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.notifications.list(),
    queryFn: () => notificationsService.list({ limit: NOTIFICATION_PAGE_SIZE_DEFAULT }),
    enabled,
    staleTime: 30_000,
  });
}

export function useNotificationMutations() {
  const queryClient = useQueryClient();

  const markRead = useMutation({
    mutationFn: (notificationId: string) => notificationsService.markRead(notificationId),
    onSuccess: (updated: NotificationResponse) => {
      queryClient.setQueryData<NotificationListResponse>(
        queryKeys.notifications.list(),
        (current) => patchNotificationReadState(current, updated),
      );
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => notificationsService.markAllRead(),
    onSuccess: () => {
      queryClient.setQueryData<NotificationListResponse>(
        queryKeys.notifications.list(),
        (current) => {
          if (current === undefined) {
            return current;
          }

          return {
            ...current,
            items: current.items.map((item) => ({ ...item, isRead: true })),
          };
        },
      );
    },
  });

  return { markRead, markAllRead };
}
