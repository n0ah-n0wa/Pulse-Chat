import { io, type Socket } from 'socket.io-client';

import type { ClientToServerEvents, ServerToClientEvents } from '@pulse-chat/shared';

import { getWebSocketPath, getWebSocketUrl } from '../lib/env';
import { useSocketStore } from '../store/socket-store';
import type { SocketConnectionState } from '../types';

type PulseSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Dedicated Socket.IO abstraction (specification section 37).
 *
 * Handles connect/disconnect, authentication, reconnection and event wiring.
 */
export class SocketService {
  private socket: PulseSocket | null = null;
  private accessToken: string | null = null;

  connect(accessToken: string): void {
    if (this.socket?.connected && this.accessToken === accessToken) {
      return;
    }

    this.disconnect();
    this.accessToken = accessToken;
    this.setConnectionState('connecting');

    this.socket = io(getWebSocketUrl(), {
      path: getWebSocketPath(),
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      auth: { token: accessToken },
    });

    this.registerLifecycleHandlers(this.socket);
  }

  disconnect(): void {
    if (this.socket !== null) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.accessToken = null;
    this.setConnectionState('disconnected');
  }

  getSocket(): PulseSocket | null {
    return this.socket;
  }

  on<E extends keyof ServerToClientEvents>(
    event: E,
    listener: ServerToClientEvents[E],
  ): () => void {
    const socket = this.socket;
    if (socket === null) {
      return () => undefined;
    }

    type EventListener = (...args: Parameters<ServerToClientEvents[E]>) => void;
    const typedListener = listener as EventListener;
    socket.on(event, typedListener as never);
    return () => {
      socket.off(event, typedListener as never);
    };
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

  private registerLifecycleHandlers(socket: PulseSocket): void {
    socket.on('connect', () => {
      const previousState = useSocketStore.getState().connectionState;
      if (previousState === 'reconnecting') {
        this.setConnectionState('reconnected');
        return;
      }

      this.setConnectionState('connected');
    });

    socket.on('disconnect', () => {
      if (this.socket === socket) {
        this.setConnectionState('disconnected');
      }
    });

    socket.io.on('reconnect_attempt', () => {
      this.setConnectionState('reconnecting');
    });

    socket.on('connect_error', (error: Error) => {
      const message = error.message.toLowerCase();
      if (message.includes('unauthorized') || message.includes('authentication')) {
        this.setConnectionState('authentication_failed');
        return;
      }

      if (socket?.connected !== true) {
        this.setConnectionState('reconnecting');
      }
    });

    socket.on('error', (payload) => {
      if (payload.code === 'UNAUTHORIZED') {
        this.setConnectionState('authentication_failed');
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
