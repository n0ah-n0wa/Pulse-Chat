import { io, type Socket } from 'socket.io-client';

import {
  CLIENT_SOCKET_EVENTS,
  SERVER_SOCKET_EVENTS,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@pulse-chat/shared';

import { getWebSocketPath, getWebSocketUrl } from '../lib/env';
import { setRealtimeTeardown } from '../lib/realtime-teardown';
import { refreshAccessToken } from './token-refresh';
import { useSocketStore } from '../store/socket-store';
import type { SocketConnectionState } from '../types';

type PulseSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type ServerEvent = keyof ServerToClientEvents;
type ServerListener<E extends ServerEvent> = ServerToClientEvents[E];

/**
 * Dedicated Socket.IO abstraction (specification section 37).
 *
 * Handles connect/disconnect, authentication, reconnection, multiplexed server
 * listeners, and reference-counted room join/leave.
 */
export class SocketService {
  private socket: PulseSocket | null = null;
  private accessToken: string | null = null;
  private connectionConsumers = 0;
  private readonly serverListeners = new Map<ServerEvent, Set<ServerListener<ServerEvent>>>();
  private readonly serverBridges = new Map<ServerEvent, (...args: unknown[]) => void>();
  private readonly roomRefCounts = new Map<string, number>();
  private readonly reconnectHandlers = new Set<() => void>();

  /** Reference-counted session connect (safe across multiple React roots). */
  acquireConnection(accessToken: string): () => void {
    this.connectionConsumers += 1;
    this.connect(accessToken);

    return () => {
      this.connectionConsumers = Math.max(0, this.connectionConsumers - 1);
      if (this.connectionConsumers === 0) {
        this.releaseConnection();
      }
    };
  }

  connect(accessToken: string): void {
    if (this.socket?.connected === true && this.accessToken === accessToken) {
      return;
    }

    this.disconnectSocketOnly();
    this.accessToken = accessToken;
    this.setConnectionState('connecting');

    this.socket = io(getWebSocketUrl(), {
      path: getWebSocketPath(),
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5_000,
      auth: { token: accessToken },
    });

    this.registerLifecycleHandlers(this.socket);
    this.attachServerBridges(this.socket);
  }

  disconnect(): void {
    this.connectionConsumers = 0;
    this.disconnectSocketOnly();
    this.accessToken = null;
    this.roomRefCounts.clear();
    this.setConnectionState('disconnected');
  }

  /**
   * Drops the transport when the last React consumer unmounts or the access
   * token rotates, but keeps room refcounts so {@link rejoinRooms} can restore
   * Socket.IO subscriptions on the next connect.
   */
  private releaseConnection(): void {
    this.disconnectSocketOnly();
    this.accessToken = null;
    this.setConnectionState('disconnected');
  }

  getSocket(): PulseSocket | null {
    return this.socket;
  }

  /** Multiplexed server listener — one underlying `socket.on` per event name. */
  addServerListener<E extends ServerEvent>(event: E, listener: ServerListener<E>): () => void {
    const bucket = this.getListenerBucket(event);
    bucket.add(listener);

    const socket = this.socket;
    if (socket !== null && !this.serverBridges.has(event)) {
      this.attachServerBridge(socket, event);
    }

    return () => {
      this.removeServerListener(event, listener);
    };
  }

  /** @deprecated Prefer {@link addServerListener} for multiplexed subscriptions. */
  on<E extends ServerEvent>(event: E, listener: ServerListener<E>): () => void {
    return this.addServerListener(event, listener);
  }

  emit<E extends keyof ClientToServerEvents>(
    event: E,
    ...args: Parameters<ClientToServerEvents[E]>
  ): void {
    const socket = this.socket;
    if (socket?.connected !== true) {
      throw new Error('Cannot emit on a disconnected socket.');
    }

    socket.emit(event, ...args);
  }

  /** Reference-counted room subscription; re-joins automatically after reconnect. */
  acquireRoom(roomId: string): () => void {
    const next = (this.roomRefCounts.get(roomId) ?? 0) + 1;
    this.roomRefCounts.set(roomId, next);

    if (next === 1) {
      this.emitRoomJoin(roomId);
    }

    return () => {
      this.releaseRoom(roomId);
    };
  }

  getJoinedRoomIds(): readonly string[] {
    return [...this.roomRefCounts.keys()];
  }

  onReconnect(handler: () => void): () => void {
    this.reconnectHandlers.add(handler);
    return () => {
      this.reconnectHandlers.delete(handler);
    };
  }

  private releaseRoom(roomId: string): void {
    const current = this.roomRefCounts.get(roomId) ?? 0;
    if (current <= 1) {
      this.roomRefCounts.delete(roomId);
      this.emitRoomLeave(roomId);
      return;
    }

    this.roomRefCounts.set(roomId, current - 1);
  }

  private emitRoomJoin(roomId: string): void {
    try {
      this.emit(CLIENT_SOCKET_EVENTS.ROOM_JOIN, { roomId });
    } catch {
      // Socket not connected yet; join runs again on connect/reconnect.
    }
  }

  private emitRoomLeave(roomId: string): void {
    try {
      this.emit(CLIENT_SOCKET_EVENTS.ROOM_LEAVE, { roomId });
    } catch {
      // Socket may already be disconnected.
    }
  }

  private rejoinRooms(): void {
    for (const roomId of this.roomRefCounts.keys()) {
      this.emitRoomJoin(roomId);
    }
  }

  private notifyReconnect(): void {
    for (const handler of this.reconnectHandlers) {
      handler();
    }
  }

  private disconnectSocketOnly(): void {
    if (this.socket !== null) {
      this.socket.removeAllListeners();
      this.socket.io.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.serverBridges.clear();
  }

  private getListenerBucket(event: ServerEvent): Set<ServerListener<ServerEvent>> {
    let bucket = this.serverListeners.get(event);
    if (bucket === undefined) {
      bucket = new Set();
      this.serverListeners.set(event, bucket);
    }
    return bucket;
  }

  private removeServerListener<E extends ServerEvent>(event: E, listener: ServerListener<E>): void {
    const bucket = this.serverListeners.get(event);
    if (bucket === undefined) {
      return;
    }

    bucket.delete(listener);
    if (bucket.size === 0) {
      this.serverListeners.delete(event);
      const bridge = this.serverBridges.get(event);
      if (bridge !== undefined && this.socket !== null) {
        this.socket.off(event, bridge as never);
      }
      this.serverBridges.delete(event);
    }
  }

  private attachServerBridge(socket: PulseSocket, event: ServerEvent): void {
    if (this.serverBridges.has(event)) {
      return;
    }

    const bridge = (...args: unknown[]) => {
      const listeners = this.serverListeners.get(event);
      if (listeners === undefined) {
        return;
      }

      for (const listener of listeners) {
        (listener as (...payload: unknown[]) => void)(...args);
      }
    };

    this.serverBridges.set(event, bridge);
    socket.on(event, bridge);
  }

  private attachServerBridges(socket: PulseSocket): void {
    for (const event of this.serverListeners.keys()) {
      if ((this.serverListeners.get(event)?.size ?? 0) > 0) {
        this.attachServerBridge(socket, event);
      }
    }
  }

  private registerLifecycleHandlers(socket: PulseSocket): void {
    socket.on('connect', () => {
      const previousState = useSocketStore.getState().connectionState;
      this.rejoinRooms();

      if (previousState === 'reconnecting') {
        this.setConnectionState('reconnected');
        this.notifyReconnect();
        return;
      }

      this.setConnectionState('connected');
    });

    socket.on('disconnect', (reason) => {
      if (this.socket !== socket) {
        return;
      }

      if (reason === 'io client disconnect') {
        this.setConnectionState('disconnected');
        return;
      }

      this.setConnectionState('reconnecting');
    });

    socket.io.on('reconnect_attempt', () => {
      this.setConnectionState('reconnecting');
    });

    socket.on('connect_error', (error: Error) => {
      const message = error.message.toLowerCase();
      if (message.includes('unauthorized') || message.includes('authentication')) {
        this.setConnectionState('authentication_failed');
        void refreshAccessToken();
        return;
      }

      const current = useSocketStore.getState().connectionState;
      if (current === 'connected' || current === 'reconnected' || current === 'reconnecting') {
        this.setConnectionState('reconnecting');
      }
    });

    socket.on(SERVER_SOCKET_EVENTS.ERROR, (payload) => {
      if (payload.code === 'UNAUTHORIZED') {
        this.setConnectionState('authentication_failed');
        void refreshAccessToken();
      }
    });
  }

  private setConnectionState(state: SocketConnectionState): void {
    useSocketStore.getState().setConnectionState(state);
  }
}

let socketService: SocketService | null = null;

export function getSocketService(): SocketService {
  socketService ??= new SocketService();
  return socketService;
}

/** Test-only helper to reset the process-wide singleton. */
export function resetSocketServiceForTests(): void {
  socketService?.disconnect();
  socketService = null;
}

setRealtimeTeardown(() => {
  socketService?.disconnect();
});
