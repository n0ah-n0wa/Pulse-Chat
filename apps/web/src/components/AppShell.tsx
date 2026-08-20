import { Link, Outlet } from 'react-router-dom';

import { APP_NAME } from '@pulse-chat/shared';

import { useRealtimeConnection } from '../hooks/useRealtimeConnection';
import { useSocketConnectionState } from '../hooks/useSocketConnectionState';
import { useAuth } from '../hooks/useAuth';
import type { SocketConnectionState } from '../types';

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
    return 'bg-emerald-100 text-emerald-800';
  }

  if (state === 'reconnecting' || state === 'connecting') {
    return 'bg-amber-100 text-amber-800';
  }

  if (state === 'authentication_failed') {
    return 'bg-rose-100 text-rose-800';
  }

  return 'bg-slate-100 text-slate-700';
}

/** Top-level layout shared by every routed page. */
export function AppShell() {
  useRealtimeConnection();

  const { isAuthenticated, user } = useAuth();
  const connectionState = useSocketConnectionState();

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <Link to="/" className="text-lg font-semibold tracking-tight">
              {APP_NAME}
            </Link>
            <p className="text-xs text-slate-500">Application foundation</p>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${connectionBadgeClass(connectionState)}`}
            >
              {CONNECTION_LABELS[connectionState]}
            </span>
            {isAuthenticated ? (
              <span className="text-sm text-slate-600">{user?.displayName}</span>
            ) : (
              <Link
                to="/login"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
