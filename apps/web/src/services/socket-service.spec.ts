import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SERVER_SOCKET_EVENTS } from '@pulse-chat/shared';

import { getSocketService, resetSocketServiceForTests } from './socket-service';
import { useSocketStore } from '../store/socket-store';

const socketHandlers: Record<string, ((...args: never[]) => void)[]> = {};
const managerHandlers: Record<string, ((...args: never[]) => void)[]> = {};
const bridgeHandlers: Record<string, ((...args: never[]) => void)[]> = {};

const socketMock = {
  connected: false,
  on: vi.fn((event: string, handler: (...args: never[]) => void) => {
    if (event.startsWith('bridge:')) {
      bridgeHandlers[event] ??= [];
      bridgeHandlers[event].push(handler);
      return;
    }
    socketHandlers[event] ??= [];
    socketHandlers[event].push(handler);
  }),
  off: vi.fn((event: string, handler: (...args: never[]) => void) => {
    const bucket = socketHandlers[event] ?? bridgeHandlers[event];
    if (bucket === undefined) {
      return;
    }
    const index = bucket.indexOf(handler);
    if (index >= 0) {
      bucket.splice(index, 1);
    }
  }),
  removeAllListeners: vi.fn(() => {
    for (const key of Object.keys(socketHandlers)) {
      delete socketHandlers[key];
    }
    for (const key of Object.keys(bridgeHandlers)) {
      delete bridgeHandlers[key];
    }
  }),
  disconnect: vi.fn(),
  emit: vi.fn(),
  io: {
    on: vi.fn((event: string, handler: (...args: never[]) => void) => {
      managerHandlers[event] ??= [];
      managerHandlers[event].push(handler);
    }),
    removeAllListeners: vi.fn(() => {
      for (const key of Object.keys(managerHandlers)) {
        delete managerHandlers[key];
      }
    }),
  },
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => {
    socketMock.connected = true;
    queueMicrotask(() => {
      for (const handler of socketHandlers['connect'] ?? []) {
        handler();
      }
    });
    return socketMock;
  }),
}));

describe('SocketService', () => {
  beforeEach(() => {
    resetSocketServiceForTests();
    useSocketStore.getState().resetConnectionState();
    vi.clearAllMocks();
    for (const key of Object.keys(socketHandlers)) {
      delete socketHandlers[key];
    }
    for (const key of Object.keys(managerHandlers)) {
      delete managerHandlers[key];
    }
    for (const key of Object.keys(bridgeHandlers)) {
      delete bridgeHandlers[key];
    }
    socketMock.connected = false;
  });

  it('moves to connected after a successful connect', async () => {
    const service = getSocketService();
    service.connect('token');

    await vi.waitFor(() => {
      expect(useSocketStore.getState().connectionState).toBe('connected');
    });
  });

  it('returns to disconnected after disconnect', () => {
    const service = getSocketService();
    service.connect('token');
    service.disconnect();

    expect(useSocketStore.getState().connectionState).toBe('disconnected');
  });

  it('multiplexes server listeners onto a single socket.on handler', async () => {
    const service = getSocketService();
    service.connect('token');

    await vi.waitFor(() => {
      expect(useSocketStore.getState().connectionState).toBe('connected');
    });

    const first = vi.fn();
    const second = vi.fn();
    const offFirst = service.addServerListener(SERVER_SOCKET_EVENTS.MESSAGE_NEW, first);
    service.addServerListener(SERVER_SOCKET_EVENTS.MESSAGE_NEW, second);

    const bridgeCall = socketMock.on.mock.calls.find(
      (call) => call[0] === SERVER_SOCKET_EVENTS.MESSAGE_NEW,
    );
    expect(bridgeCall).toBeDefined();

    const bridge = bridgeCall?.[1] as (...args: never[]) => void;
    bridge({ message: { id: '1' } } as never);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    offFirst();
    bridge({ message: { id: '2' } } as never);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it('reference-counts room joins and re-emits on reconnect', async () => {
    const service = getSocketService();
    service.connect('token');

    await vi.waitFor(() => {
      expect(useSocketStore.getState().connectionState).toBe('connected');
    });

    const release = service.acquireRoom('507f1f77bcf86cd799439021');
    expect(socketMock.emit).toHaveBeenCalledWith('room:join', {
      roomId: '507f1f77bcf86cd799439021',
    });

    release();
    expect(socketMock.emit).toHaveBeenCalledWith('room:leave', {
      roomId: '507f1f77bcf86cd799439021',
    });
  });

  it('uses reference counting for acquireConnection', async () => {
    const service = getSocketService();
    const releaseA = service.acquireConnection('token-a');

    await vi.waitFor(() => {
      expect(useSocketStore.getState().connectionState).toBe('connected');
    });

    const releaseB = service.acquireConnection('token-a');

    releaseA();
    expect(useSocketStore.getState().connectionState).toBe('connected');

    releaseB();
    expect(useSocketStore.getState().connectionState).toBe('disconnected');
  });

  it('keeps room subscriptions when the last connection consumer releases', async () => {
    const service = getSocketService();
    const release = service.acquireConnection('token-a');

    await vi.waitFor(() => {
      expect(useSocketStore.getState().connectionState).toBe('connected');
    });

    service.acquireRoom('507f1f77bcf86cd799439021');
    socketMock.emit.mockClear();
    release();

    expect(useSocketStore.getState().connectionState).toBe('disconnected');
    expect(service.getJoinedRoomIds()).toEqual(['507f1f77bcf86cd799439021']);

    service.acquireConnection('token-b');

    await vi.waitFor(() => {
      expect(useSocketStore.getState().connectionState).toBe('connected');
    });

    expect(socketMock.emit).toHaveBeenCalledWith('room:join', {
      roomId: '507f1f77bcf86cd799439021',
    });
  });

  it('clears room subscriptions on a full disconnect', async () => {
    const service = getSocketService();
    service.acquireConnection('token-a');

    await vi.waitFor(() => {
      expect(useSocketStore.getState().connectionState).toBe('connected');
    });

    service.acquireRoom('507f1f77bcf86cd799439021');
    service.disconnect();

    expect(service.getJoinedRoomIds()).toEqual([]);
  });

  it('transitions to reconnecting on reconnect_attempt', async () => {
    const service = getSocketService();
    service.connect('token');

    await vi.waitFor(() => {
      expect(useSocketStore.getState().connectionState).toBe('connected');
    });

    for (const handler of managerHandlers['reconnect_attempt'] ?? []) {
      handler();
    }

    expect(useSocketStore.getState().connectionState).toBe('reconnecting');
  });

  it('marks reconnecting on unexpected disconnect and restores rooms after reconnect', async () => {
    const service = getSocketService();
    service.connect('token');

    await vi.waitFor(() => {
      expect(useSocketStore.getState().connectionState).toBe('connected');
    });

    const reconnect = vi.fn();
    service.onReconnect(reconnect);
    service.acquireRoom('507f1f77bcf86cd799439021');
    socketMock.emit.mockClear();

    socketMock.connected = false;
    for (const handler of socketHandlers['disconnect'] ?? []) {
      (handler as (reason: string) => void)('transport close');
    }

    expect(useSocketStore.getState().connectionState).toBe('reconnecting');

    socketMock.connected = true;
    for (const handler of socketHandlers['connect'] ?? []) {
      handler();
    }

    expect(useSocketStore.getState().connectionState).toBe('reconnected');
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(socketMock.emit).toHaveBeenCalledWith('room:join', {
      roomId: '507f1f77bcf86cd799439021',
    });
  });

  it('does not treat an intentional client disconnect as a reconnect', async () => {
    const service = getSocketService();
    service.connect('token');

    await vi.waitFor(() => {
      expect(useSocketStore.getState().connectionState).toBe('connected');
    });

    socketMock.connected = false;
    for (const handler of socketHandlers['disconnect'] ?? []) {
      (handler as (reason: string) => void)('io client disconnect');
    }

    expect(useSocketStore.getState().connectionState).toBe('disconnected');
  });
});
