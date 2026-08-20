import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UsersService } from '../users/users.service.js';
import { createPresenceOptions, PresenceService } from './presence.service.js';
import type {
  PresenceNotifier,
  PresenceStore,
  UserPresenceSnapshot,
} from './presence.store.interface.js';

const USER_ID = '507f1f77bcf86cd799439011';
const SOCKET_A = 'socket-a';
const SOCKET_B = 'socket-b';

function snapshot(overrides: Partial<UserPresenceSnapshot> = {}): UserPresenceSnapshot {
  return {
    userId: USER_ID,
    status: 'online',
    lastSeenAt: new Date('2026-08-18T12:00:00.000Z'),
    instanceId: 'test-instance',
    socketIds: [SOCKET_A],
    ...overrides,
  };
}

describe('PresenceService', () => {
  const addConnection = vi.fn<PresenceStore['addConnection']>();
  const removeConnection = vi.fn<PresenceStore['removeConnection']>();
  const refreshConnection = vi.fn<PresenceStore['refreshConnection']>();
  const getPresence = vi.fn<PresenceStore['getPresence']>();
  const clearUser = vi.fn<PresenceStore['clearUser']>();
  const recordLastSeen = vi.fn<UsersService['recordLastSeen']>();
  const notifyOnline = vi.fn<PresenceNotifier['notifyOnline']>();
  const notifyOffline = vi.fn<PresenceNotifier['notifyOffline']>();

  const store: PresenceStore = {
    addConnection,
    removeConnection,
    refreshConnection,
    getPresence,
    clearUser,
  };

  const users = { recordLastSeen } as unknown as UsersService;
  const notifier: PresenceNotifier = { notifyOnline, notifyOffline };

  let service: PresenceService;

  beforeEach(() => {
    vi.resetAllMocks();
    recordLastSeen.mockResolvedValue(undefined);
    service = new PresenceService(
      store,
      users,
      notifier,
      createPresenceOptions({
        heartbeatIntervalMs: 0,
        instanceId: 'test-instance',
      }),
    );
  });

  it('marks a user online on the first connection', async () => {
    getPresence.mockResolvedValueOnce(null).mockResolvedValueOnce(snapshot());
    addConnection.mockResolvedValue({
      connectionCount: 1,
      lastSeenAt: snapshot().lastSeenAt,
    });

    const result = await service.connect(USER_ID, SOCKET_A);

    expect(result.status).toBe('online');
    expect(result.socketIds).toEqual([SOCKET_A]);
    expect(service.countLocalConnections(USER_ID)).toBe(1);
    expect(notifyOnline).toHaveBeenCalledWith({
      userId: USER_ID,
      lastSeenAt: snapshot().lastSeenAt.toISOString(),
    });
    expect(notifyOffline).not.toHaveBeenCalled();
    expect(recordLastSeen).toHaveBeenCalledWith(USER_ID, snapshot().lastSeenAt);
  });

  it('does not rebroadcast online when a second connection is added', async () => {
    getPresence
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(snapshot({ socketIds: [SOCKET_A] }))
      .mockResolvedValueOnce(snapshot({ socketIds: [SOCKET_A, SOCKET_B] }));
    addConnection
      .mockResolvedValueOnce({ connectionCount: 1, lastSeenAt: snapshot().lastSeenAt })
      .mockResolvedValueOnce({ connectionCount: 2, lastSeenAt: snapshot().lastSeenAt });

    await service.connect(USER_ID, SOCKET_A);
    await service.connect(USER_ID, SOCKET_B);

    expect(service.countLocalConnections(USER_ID)).toBe(2);
    expect(notifyOnline).toHaveBeenCalledTimes(1);
    expect(notifyOffline).not.toHaveBeenCalled();
  });

  it('keeps the user online after one of two connections disconnects', async () => {
    getPresence
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(snapshot({ socketIds: [SOCKET_A] }))
      .mockResolvedValueOnce(snapshot({ socketIds: [SOCKET_A, SOCKET_B] }));
    addConnection
      .mockResolvedValueOnce({ connectionCount: 1, lastSeenAt: snapshot().lastSeenAt })
      .mockResolvedValueOnce({ connectionCount: 2, lastSeenAt: snapshot().lastSeenAt });
    removeConnection.mockResolvedValue({
      connectionCount: 1,
      lastSeenAt: snapshot().lastSeenAt,
    });

    await service.connect(USER_ID, SOCKET_A);
    await service.connect(USER_ID, SOCKET_B);
    const remaining = await service.disconnect(USER_ID, SOCKET_A);

    expect(remaining?.status).toBe('online');
    expect(service.countLocalConnections(USER_ID)).toBe(1);
    expect(notifyOffline).not.toHaveBeenCalled();
  });

  it('marks the user offline when the final connection disconnects', async () => {
    getPresence.mockResolvedValueOnce(null).mockResolvedValueOnce(snapshot());
    addConnection.mockResolvedValue({
      connectionCount: 1,
      lastSeenAt: snapshot().lastSeenAt,
    });
    removeConnection.mockResolvedValue({
      connectionCount: 0,
      lastSeenAt: snapshot().lastSeenAt,
    });

    await service.connect(USER_ID, SOCKET_A);
    const remaining = await service.disconnect(USER_ID, SOCKET_A);

    expect(remaining).toBeNull();
    expect(service.countLocalConnections(USER_ID)).toBe(0);
    expect(notifyOffline).toHaveBeenCalledWith({
      userId: USER_ID,
      lastSeenAt: snapshot().lastSeenAt.toISOString(),
    });
    expect(recordLastSeen).toHaveBeenCalledTimes(2);
  });

  it('supports multiple devices as independent socket sessions', async () => {
    getPresence
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(snapshot({ socketIds: [SOCKET_A] }))
      .mockResolvedValueOnce(snapshot({ socketIds: [SOCKET_A] }))
      .mockResolvedValueOnce(snapshot({ socketIds: [SOCKET_A, SOCKET_B] }));
    addConnection
      .mockResolvedValueOnce({ connectionCount: 1, lastSeenAt: snapshot().lastSeenAt })
      .mockResolvedValueOnce({ connectionCount: 2, lastSeenAt: snapshot().lastSeenAt });

    await service.connect(USER_ID, SOCKET_A);
    const desktopAndMobile = await service.connect(USER_ID, SOCKET_B);

    expect(desktopAndMobile.socketIds).toEqual([SOCKET_A, SOCKET_B]);
    expect(service.countLocalConnections(USER_ID)).toBe(2);
  });

  it('emits online again after reconnecting once fully offline', async () => {
    getPresence
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(snapshot());
    addConnection.mockResolvedValue({
      connectionCount: 1,
      lastSeenAt: snapshot().lastSeenAt,
    });
    removeConnection.mockResolvedValue({
      connectionCount: 0,
      lastSeenAt: snapshot().lastSeenAt,
    });

    await service.connect(USER_ID, SOCKET_A);
    await service.disconnect(USER_ID, SOCKET_A);
    await service.connect(USER_ID, SOCKET_B);

    expect(notifyOnline).toHaveBeenCalledTimes(2);
    expect(notifyOffline).toHaveBeenCalledTimes(1);
    expect(service.countLocalConnections(USER_ID)).toBe(1);
  });

  it('treats TTL expiration as offline without a disconnect event', async () => {
    getPresence
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(null);
    addConnection.mockResolvedValue({
      connectionCount: 1,
      lastSeenAt: snapshot().lastSeenAt,
    });

    await service.connect(USER_ID, SOCKET_A);
    await service.sweepExpired();

    expect(notifyOffline).toHaveBeenCalledWith({
      userId: USER_ID,
      lastSeenAt: snapshot().lastSeenAt.toISOString(),
    });
    expect(service.countLocalConnections(USER_ID)).toBe(0);
  });

  it('does not start a heartbeat interval when heartbeatIntervalMs is 0', () => {
    service.onModuleInit();
    service.onModuleDestroy();

    expect(notifyOnline).not.toHaveBeenCalled();
  });
});
