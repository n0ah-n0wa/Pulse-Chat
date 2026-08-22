import { Link } from 'react-router-dom';

import { useSocketConnectionState } from '../../hooks/useSocketConnectionState';
import { useNotificationMutations, useNotificationsQuery } from '../../hooks/useNotificationsQuery';
import { toDisplayErrorMessage } from '../../lib/errors';
import {
  notificationRoomPath,
  notificationSummary,
  notificationTypeLabel,
} from '../../lib/notification-display';
import { NotificationBadge } from './NotificationBadge';

interface NotificationCenterProps {
  readonly onClose: () => void;
}

export function NotificationCenter({ onClose }: NotificationCenterProps) {
  const connectionState = useSocketConnectionState();
  const notificationsQuery = useNotificationsQuery();
  const { markRead, markAllRead } = useNotificationMutations();

  const offline =
    connectionState === 'disconnected' ||
    connectionState === 'reconnecting' ||
    connectionState === 'authentication_failed';

  const items = notificationsQuery.data?.items ?? [];
  const unreadCount = items.filter((item) => !item.isRead).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Notifications</h2>
          <NotificationBadge count={unreadCount} />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={unreadCount === 0 || markAllRead.isPending}
            onClick={() => {
              markAllRead.mutate();
            }}
            className="text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50 dark:text-slate-300 dark:hover:text-slate-50"
          >
            Mark all read
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700"
          >
            Close
          </button>
        </div>
      </div>

      {offline ? (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          Offline — showing last loaded notifications. Reconnect for live updates.
        </p>
      ) : null}

      {notificationsQuery.isLoading ? (
        <p className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">
          Loading notifications…
        </p>
      ) : null}

      {notificationsQuery.isError ? (
        <div className="px-4 py-6">
          <p className="text-sm text-rose-700 dark:text-rose-400">
            {toDisplayErrorMessage(notificationsQuery.error, 'Notifications are unavailable.')}
          </p>
          <button
            type="button"
            className="mt-2 text-xs font-medium text-slate-700 underline dark:text-slate-200"
            onClick={() => {
              void notificationsQuery.refetch();
            }}
          >
            Retry
          </button>
        </div>
      ) : null}

      {!notificationsQuery.isLoading && !notificationsQuery.isError && items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">
          No notifications yet.
        </p>
      ) : null}

      <ul className="min-h-0 flex-1 overflow-y-auto" aria-label="Notifications">
        {items.map((notification) => {
          const roomPath = notificationRoomPath(notification);
          const title = notificationTypeLabel(notification.type);
          const summary = notificationSummary(notification);

          return (
            <li
              key={notification.id}
              className={
                notification.isRead
                  ? 'border-b border-slate-100 px-4 py-3 dark:border-slate-800'
                  : 'border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60'
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {roomPath === undefined ? (
                    <>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-50">
                        {title}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{summary}</p>
                    </>
                  ) : (
                    <Link
                      to={roomPath}
                      aria-label={`Open ${title.toLowerCase()}`}
                      onClick={() => {
                        if (!notification.isRead) {
                          markRead.mutate(notification.id);
                        }
                        onClose();
                      }}
                      className="block min-w-0 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
                    >
                      <p className="text-sm font-medium text-slate-900 underline-offset-2 hover:underline dark:text-slate-50">
                        {title}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{summary}</p>
                      <p className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                        Open conversation
                      </p>
                    </Link>
                  )}
                </div>
                {!notification.isRead ? (
                  <button
                    type="button"
                    disabled={markRead.isPending}
                    onClick={() => {
                      markRead.mutate(notification.id);
                    }}
                    className="shrink-0 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-50"
                  >
                    Mark read
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
