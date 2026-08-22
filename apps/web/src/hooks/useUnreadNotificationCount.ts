import { useMemo } from 'react';

import { countUnreadNotifications } from '../lib/unread-count';
import { useNotificationsQuery } from './useNotificationsQuery';

export function useUnreadNotificationCount(): number {
  const notificationsQuery = useNotificationsQuery();

  return useMemo(() => {
    const items = notificationsQuery.data?.items ?? [];
    return countUnreadNotifications(items);
  }, [notificationsQuery.data?.items]);
}
