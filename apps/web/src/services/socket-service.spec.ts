import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getSocketService, resetSocketServiceForTests } from './socket-service';
import { useSocketStore } from '../store/socket-store';

const socketHandlers: Record<string, ((...args: never[]) => void)[]> = {};
const managerHandlers: Record<string, ((...args: never[]) => void)[]> = {};

const socketMock = {
  connected: false,
  on: vi.fn((event: string, handler: (...args: never[]) => void) => {
    socketHandlers[event] ??= [];
    socketHandlers[event].push(handler);
  }),
  off: vi.fn(),
  removeAllListeners: vi.fn(),
  disconnect: vi.fn(),
  emit: vi.fn(),
  io: {
    on: vi.fn((event: string, handler: (...args: never[]) => void) => {
      managerHandlers[event] ??= [];
      managerHandlers[event].push(handler);
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
});
