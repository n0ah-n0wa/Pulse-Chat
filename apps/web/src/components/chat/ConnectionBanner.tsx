import type { SocketConnectionState } from '../../types';

interface ConnectionBannerProps {
  readonly connectionState: SocketConnectionState;
}

export function ConnectionBanner({ connectionState }: ConnectionBannerProps) {
  if (
    connectionState === 'connected' ||
    connectionState === 'reconnected' ||
    connectionState === 'connecting'
  ) {
    return null;
  }

  let message = 'You are offline. Messages may be out of date.';
  if (connectionState === 'reconnecting') {
    message = 'Reconnecting...';
  } else if (connectionState === 'authentication_failed') {
    message = 'Realtime authentication failed. Try signing in again.';
  }

  return (
    <div
      role="status"
      className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
    >
      {message}
    </div>
  );
}
