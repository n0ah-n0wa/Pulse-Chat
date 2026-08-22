import type { QueryClient } from '@tanstack/react-query';

import { SERVER_SOCKET_EVENTS } from '@pulse-chat/shared';

import {
  applyMessageDeleted,
  applyMessageNew,
  applyMessageUpdated,
  applyNotificationNew,
  applyReactionChanged,
  applyRoomJoined,
  applyRoomLeft,
  applyUserPresence,
  refreshAfterReconnect,
} from '../lib/realtime-query-sync';
import { getSocketService } from '../services/socket-service';
import { applyTypingStarted, applyTypingStopped } from '../store/room-typing-store';

/**
 * Process-wide realtime → React Query bridge.
 *
 * Registers exactly one multiplexed listener per server event and keeps the
 * latest QueryClient via {@link bindQueryClient} (avoids stale closures).
 */
class RealtimeSyncService {
  private consumers = 0;
  private queryClient: QueryClient | null = null;
  private readonly teardown: (() => void)[] = [];

  bindQueryClient(queryClient: QueryClient): void {
    this.queryClient = queryClient;
  }

  start(): () => void {
    this.consumers += 1;
    if (this.consumers > 1) {
      return () => {
        this.stopConsumer();
      };
    }

    const socket = getSocketService();

    this.teardown.push(
      socket.addServerListener(SERVER_SOCKET_EVENTS.MESSAGE_NEW, (payload) => {
        this.withClient((client) => {
          applyMessageNew(client, payload.message);
        });
      }),
      socket.addServerListener(SERVER_SOCKET_EVENTS.MESSAGE_UPDATED, (payload) => {
        this.withClient((client) => {
          applyMessageUpdated(client, payload.message);
        });
      }),
      socket.addServerListener(SERVER_SOCKET_EVENTS.MESSAGE_DELETED, (payload) => {
        this.withClient((client) => {
          applyMessageDeleted(client, payload.message);
        });
      }),
      socket.addServerListener(SERVER_SOCKET_EVENTS.REACTION_ADDED, (payload) => {
        this.withClient((client) => {
          applyReactionChanged(client, payload);
        });
      }),
      socket.addServerListener(SERVER_SOCKET_EVENTS.REACTION_REMOVED, (payload) => {
        this.withClient((client) => {
          applyReactionChanged(client, payload);
        });
      }),
      socket.addServerListener(SERVER_SOCKET_EVENTS.USER_ONLINE, (payload) => {
        this.withClient((client) => {
          applyUserPresence(client, payload, true);
        });
      }),
      socket.addServerListener(SERVER_SOCKET_EVENTS.USER_OFFLINE, (payload) => {
        this.withClient((client) => {
          applyUserPresence(client, payload, false);
        });
      }),
      socket.addServerListener(SERVER_SOCKET_EVENTS.NOTIFICATION_NEW, (payload) => {
        this.withClient((client) => {
          applyNotificationNew(client, payload);
        });
      }),
      socket.addServerListener(SERVER_SOCKET_EVENTS.TYPING_STARTED, (payload) => {
        applyTypingStarted(payload);
      }),
      socket.addServerListener(SERVER_SOCKET_EVENTS.TYPING_STOPPED, (payload) => {
        applyTypingStopped(payload);
      }),
      socket.addServerListener(SERVER_SOCKET_EVENTS.ROOM_JOINED, (payload) => {
        this.withClient((client) => {
          applyRoomJoined(client, payload);
        });
      }),
      socket.addServerListener(SERVER_SOCKET_EVENTS.ROOM_LEFT, (payload) => {
        this.withClient((client) => {
          applyRoomLeft(client, payload.roomId);
        });
      }),
      socket.onReconnect(() => {
        this.withClient((client) => {
          void refreshAfterReconnect(client, socket.getJoinedRoomIds());
        });
      }),
    );

    return () => {
      this.stopConsumer();
    };
  }

  private stopConsumer(): void {
    this.consumers = Math.max(0, this.consumers - 1);
    if (this.consumers > 0) {
      return;
    }

    for (const off of this.teardown) {
      off();
    }
    this.teardown.length = 0;
  }

  private withClient(run: (client: QueryClient) => void): void {
    const client = this.queryClient;
    if (client !== null) {
      run(client);
    }
  }
}

let realtimeSyncService: RealtimeSyncService | null = null;

function getRealtimeSyncService(): RealtimeSyncService {
  realtimeSyncService ??= new RealtimeSyncService();
  return realtimeSyncService;
}

export function bindRealtimeQueryClient(queryClient: QueryClient): void {
  getRealtimeSyncService().bindQueryClient(queryClient);
}

export function startRealtimeSync(): () => void {
  return getRealtimeSyncService().start();
}

/** Test-only helper. */
export function resetRealtimeSyncForTests(): void {
  realtimeSyncService = null;
}
