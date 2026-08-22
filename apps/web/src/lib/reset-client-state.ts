import type { QueryClient } from '@tanstack/react-query';

import { bumpSessionGeneration } from './session-generation';
import { teardownRealtimeTransport } from './realtime-teardown';
import { useAuthStore } from '../store/auth-store';
import { usePresenceStore } from '../store/presence-store';
import { useRoomTypingStore } from '../store/room-typing-store';
import { useRoomUiStore } from '../store/room-ui-store';
import { useUnreadStore } from '../store/unread-store';

/** Drops cached REST data and ephemeral UI so a later login cannot see the previous user. */
export function resetClientState(queryClient: QueryClient): void {
  teardownRealtimeTransport();
  bumpSessionGeneration();
  queryClient.clear();
  useAuthStore.getState().clearSession();
  usePresenceStore.getState().resetPresence();
  useUnreadStore.getState().reset();
  useRoomTypingStore.getState().reset();
  useRoomUiStore.setState({
    currentRoomId: null,
    isRoomNavOpen: false,
    isMemberPanelOpen: false,
    isNotificationPanelOpen: false,
  });
}
