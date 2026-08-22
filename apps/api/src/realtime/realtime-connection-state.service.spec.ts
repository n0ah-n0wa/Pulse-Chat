import { describe, expect, it } from 'vitest';

import { RealtimeConnectionStateService } from './realtime-connection-state.service.js';

describe('RealtimeConnectionStateService', () => {
  it('tracks connections and room subscriptions', () => {
    const state = new RealtimeConnectionStateService();
    state.registerConnection('socket-a', 'user-1');
    state.addRoomSubscription('socket-a', 'room-1');
    state.addRoomSubscription('socket-a', 'room-2');

    expect(state.hasConnection('socket-a')).toBe(true);
    expect(state.countConnectionsForUser('user-1')).toBe(1);
    expect(state.getRoomSubscriptions('socket-a')).toEqual(['room-1', 'room-2']);
  });

  it('clears subscriptions when a connection is removed', () => {
    const state = new RealtimeConnectionStateService();
    state.registerConnection('socket-a', 'user-1');
    state.addRoomSubscription('socket-a', 'room-1');
    state.removeConnection('socket-a');

    expect(state.hasConnection('socket-a')).toBe(false);
    expect(state.getRoomSubscriptions('socket-a')).toEqual([]);
    expect(state.countConnectionsForUser('user-1')).toBe(0);
  });

  it('prunes stale sockets without touching live ones', () => {
    const state = new RealtimeConnectionStateService();
    state.registerConnection('stale', 'user-1');
    state.addRoomSubscription('stale', 'room-1');
    state.registerConnection('live', 'user-1');
    state.addRoomSubscription('live', 'room-1');

    const removed = state.removeStaleConnections((socketId) => socketId === 'live');

    expect(removed).toEqual([{ socketId: 'stale', userId: 'user-1' }]);
    expect(state.hasConnection('stale')).toBe(false);
    expect(state.getRoomSubscriptions('stale')).toEqual([]);
    expect(state.hasConnection('live')).toBe(true);
    expect(state.getRoomSubscriptions('live')).toEqual(['room-1']);
    expect(state.countConnectionsForUser('user-1')).toBe(1);
  });

  it('clears one room for every socket belonging to a user', () => {
    const state = new RealtimeConnectionStateService();
    state.registerConnection('socket-a', 'user-1');
    state.addRoomSubscription('socket-a', 'room-1');
    state.addRoomSubscription('socket-a', 'room-2');
    state.registerConnection('socket-b', 'user-2');
    state.addRoomSubscription('socket-b', 'room-1');

    state.removeRoomSubscriptionsForUser('user-1', 'room-1');

    expect(state.getRoomSubscriptions('socket-a')).toEqual(['room-2']);
    expect(state.getRoomSubscriptions('socket-b')).toEqual(['room-1']);
  });
});
