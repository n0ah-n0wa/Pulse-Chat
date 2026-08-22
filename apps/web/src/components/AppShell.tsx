import { Link, Outlet } from 'react-router-dom';

import { APP_NAME } from '@pulse-chat/shared';

import { useAuth } from '../hooks/useAuth';
import { useLogout } from '../hooks/useLogout';
import { useMemberRoomSubscriptions } from '../hooks/useMemberRoomSubscriptions';
import { useRealtimeConnection } from '../hooks/useRealtimeConnection';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import { useSocketConnectionState } from '../hooks/useSocketConnectionState';
import type { SocketConnectionState } from '../types';
import { ThemeToggle } from './theme/ThemeToggle';

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

/** Public marketing and auth layout. */
export function AppShell() {
  useRealtimeConnection();
  useRealtimeSync();
  useMemberRoomSubscriptions();

  const { isAuthenticated, user } = useAuth();
  const logout = useLogout();
  const connectionState = useSocketConnectionState();
  const isSigningOut = logout.isPending;

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <Link to="/" className="text-lg font-semibold tracking-tight">
              {APP_NAME}
            </Link>
            <p className="text-xs text-slate-500 dark:text-slate-400">Application foundation</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <ThemeToggle />
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${connectionBadgeClass(connectionState)}`}
            >
              {CONNECTION_LABELS[connectionState]}
            </span>
            {isAuthenticated ? (
              <>
                <span className="text-sm text-slate-600 dark:text-slate-300">
                  {user?.displayName}
                </span>
                <Link
                  to={`/profile/${user?.username ?? ''}`}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
                >
                  Profile
                </Link>
                <Link
                  to="/settings"
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
                >
                  Settings
                </Link>
                <Link
                  to="/app"
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
                >
                  Open chat
                </Link>
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
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
                >
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
