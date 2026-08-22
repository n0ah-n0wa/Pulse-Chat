import { useEffect } from 'react';
import { Link, Outlet, useParams } from 'react-router-dom';

import { APP_NAME } from '@pulse-chat/shared';

import { useAuth } from '../../hooks/useAuth';
import { useLogout } from '../../hooks/useLogout';
import { useMemberRoomSubscriptions } from '../../hooks/useMemberRoomSubscriptions';
import { useRealtimeConnection } from '../../hooks/useRealtimeConnection';
import { useRealtimeSync } from '../../hooks/useRealtimeSync';
import { useSocketConnectionState } from '../../hooks/useSocketConnectionState';
import { useRoomUiStore } from '../../store/room-ui-store';
import type { SocketConnectionState } from '../../types';
import { NotificationBellBadge } from '../notifications/NotificationBadge';
import { NotificationCenter } from '../notifications/NotificationCenter';
import { ThemeToggle } from '../theme/ThemeToggle';
import { MemberList } from './MemberList';
import { OverlayDrawer } from './OverlayDrawer';
import { RoomList } from './RoomList';

const CONNECTION_LABELS: Record<SocketConnectionState, string> = {
  disconnected: 'Offline',
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  reconnected: 'Connected',
  authentication_failed: 'Authentication failed',
};

function connectionBadgeClass(state: SocketConnectionState): string {
  if (state === 'connected' || state === 'reconnected') {
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100';
  }

  if (state === 'reconnecting' || state === 'connecting') {
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100';
  }

  if (state === 'authentication_failed') {
    return 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-100';
  }

  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
}

/** Full-viewport authenticated workspace: rooms, chat, and members. */
export function ChatLayout() {
  useRealtimeConnection();
  useRealtimeSync();
  useMemberRoomSubscriptions();

  const { roomId } = useParams<{ roomId?: string }>();
  const { user } = useAuth();
  const logout = useLogout();
  const connectionState = useSocketConnectionState();
  const setCurrentRoomId = useRoomUiStore((state) => state.setCurrentRoomId);
  const isRoomNavOpen = useRoomUiStore((state) => state.isRoomNavOpen);
  const isMemberPanelOpen = useRoomUiStore((state) => state.isMemberPanelOpen);
  const openRoomNav = useRoomUiStore((state) => state.openRoomNav);
  const closeRoomNav = useRoomUiStore((state) => state.closeRoomNav);
  const openMemberPanel = useRoomUiStore((state) => state.openMemberPanel);
  const closeMemberPanel = useRoomUiStore((state) => state.closeMemberPanel);
  const isNotificationPanelOpen = useRoomUiStore((state) => state.isNotificationPanelOpen);
  const openNotificationPanel = useRoomUiStore((state) => state.openNotificationPanel);
  const closeNotificationPanel = useRoomUiStore((state) => state.closeNotificationPanel);

  useEffect(() => {
    setCurrentRoomId(roomId ?? null);
  }, [roomId, setCurrentRoomId]);

  const isSigningOut = logout.isPending;

  return (
    <div className="flex h-dvh flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3 px-3 py-2 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm font-medium lg:hidden dark:border-slate-700"
              aria-expanded={isRoomNavOpen}
              aria-controls="room-drawer"
              onClick={openRoomNav}
            >
              Rooms
            </button>
            <Link to="/app" className="truncate text-base font-semibold tracking-tight">
              {APP_NAME}
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <span
              className={`hidden rounded-full px-3 py-1 text-xs font-medium sm:inline ${connectionBadgeClass(connectionState)}`}
            >
              {CONNECTION_LABELS[connectionState]}
            </span>
            <ThemeToggle />
            <button
              type="button"
              aria-label="Notifications"
              aria-expanded={isNotificationPanelOpen}
              onClick={openNotificationPanel}
              className="relative rounded-md border border-slate-300 px-2.5 py-1.5 text-sm font-medium dark:border-slate-700"
            >
              Notifications
              <span className="absolute -right-1 -top-1">
                <NotificationBellBadge />
              </span>
            </button>
            <span className="hidden max-w-[10rem] truncate text-sm text-slate-600 sm:inline dark:text-slate-300">
              {user?.displayName}
            </span>
            <Link
              to={`/profile/${user?.username ?? ''}`}
              className="hidden rounded-md border border-slate-300 px-2.5 py-1.5 text-sm font-medium sm:inline dark:border-slate-700"
            >
              Profile
            </Link>
            <Link
              to="/settings"
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm font-medium dark:border-slate-700"
            >
              Settings
            </Link>
            <button
              type="button"
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm font-medium lg:hidden dark:border-slate-700"
              aria-expanded={isMemberPanelOpen}
              disabled={roomId === undefined}
              onClick={openMemberPanel}
            >
              Members
            </button>
            <button
              type="button"
              disabled={isSigningOut}
              onClick={() => {
                logout.mutate();
              }}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {isSigningOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-3 lg:block dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Rooms
          </h2>
          <RoomList />
        </aside>

        <main className="min-w-0 flex-1 bg-slate-50 dark:bg-slate-950">
          <Outlet />
        </main>

        <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-3 lg:block dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Members
          </h2>
          <MemberList roomId={roomId} />
        </aside>
      </div>

      <div id="room-drawer">
        <OverlayDrawer open={isRoomNavOpen} title="Rooms" side="left" onClose={closeRoomNav}>
          <RoomList onRoomSelected={closeRoomNav} />
        </OverlayDrawer>
      </div>
      <OverlayDrawer
        open={isMemberPanelOpen}
        title="Members"
        side="right"
        onClose={closeMemberPanel}
      >
        <MemberList roomId={roomId} />
      </OverlayDrawer>

      {isNotificationPanelOpen ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close notifications"
            className="absolute inset-0 bg-slate-950/40"
            onClick={closeNotificationPanel}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Notifications"
            className="absolute right-2 top-14 flex h-[min(32rem,70vh)] w-[min(24rem,96vw)] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:right-4"
          >
            <NotificationCenter onClose={closeNotificationPanel} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
