import { describe, expect, it, vi } from 'vitest';
import type { Server } from 'socket.io';

import { SERVER_SOCKET_EVENTS } from '@pulse-chat/shared';

import type { NestStructuredLoggerService } from '../infrastructure/logging/nest-structured-logger.service.js';
import { DISTRIBUTED_REALTIME_EVENTS } from './bus/realtime-bus.channels.js';
import type { RealtimeBusEnvelope } from './bus/realtime-bus.envelope.js';
import type { RealtimeEventPublisher } from './bus/realtime-event-publisher.interface.js';
import type { RealtimeEventSubscriber } from './bus/realtime-event-subscriber.interface.js';
import { RealtimeConnectionStateService } from './realtime-connection-state.service.js';
import { RealtimeMessageBroadcastService } from './realtime-message-broadcast.service.js';

const ROOM_ID = '507f1f77bcf86cd799439021';
const USER_ID = '507f1f77bcf86cd799439011';
const OTHER_USER_ID = '507f1f77bcf86cd799439012';

describe('RealtimeMessageBroadcastService', () => {
  function createService(
    publisher: RealtimeEventPublisher,
    subscriber: RealtimeEventSubscriber,
    connections = new RealtimeConnectionStateService(),
  ): RealtimeMessageBroadcastService {
    return new RealtimeMessageBroadcastService(
      publisher,
      subscriber,
      {
        error: vi.fn(),
      } as unknown as NestStructuredLoggerService,
      connections,
    );
  }

  it('leaves matching sockets, clears tracked subscriptions, and publishes member-removed', async () => {
    const leave = vi.fn().mockResolvedValue(undefined);
    const emit = vi.fn();
    const otherLeave = vi.fn();
    const otherEmit = vi.fn();
    const sockets = new Map([
      ['socket-target', { data: { userId: USER_ID }, leave, emit }],
      ['socket-other', { data: { userId: OTHER_USER_ID }, leave: otherLeave, emit: otherEmit }],
    ]);
    const publish = vi.fn().mockResolvedValue(undefined);
    const publisher: RealtimeEventPublisher = { publish };
    const subscriber: RealtimeEventSubscriber = { onEvent: vi.fn() };
    const connections = new RealtimeConnectionStateService();
    connections.registerConnection('socket-target', USER_ID);
    connections.addRoomSubscription('socket-target', ROOM_ID);
    connections.addRoomSubscription('socket-target', 'other-room');
    const service = createService(publisher, subscriber, connections);
    service.attachServer({ sockets: { sockets } } as unknown as Server);

    await service.evictMemberFromRoom(ROOM_ID, USER_ID);

    expect(leave).toHaveBeenCalledWith(ROOM_ID);
    expect(emit).toHaveBeenCalledWith(SERVER_SOCKET_EVENTS.ROOM_LEFT, { roomId: ROOM_ID });
    expect(otherLeave).not.toHaveBeenCalled();
    expect(otherEmit).not.toHaveBeenCalled();
    expect(connections.getRoomSubscriptions('socket-target')).toEqual(['other-room']);
    expect(publish).toHaveBeenCalledWith({
      event: DISTRIBUTED_REALTIME_EVENTS.MEMBER_REMOVED,
      roomId: ROOM_ID,
      userId: USER_ID,
      payload: { roomId: ROOM_ID, userId: USER_ID },
    });
  });

  it('applies remote member-removed envelopes locally without republishing', () => {
    const leave = vi.fn().mockResolvedValue(undefined);
    const emit = vi.fn();
    let handler: ((envelope: RealtimeBusEnvelope) => void) | undefined;
    const publish = vi.fn().mockResolvedValue(undefined);
    const publisher: RealtimeEventPublisher = { publish };
    const subscriber: RealtimeEventSubscriber = {
      onEvent: (next) => {
        handler = next;
      },
    };
    const connections = new RealtimeConnectionStateService();
    connections.registerConnection('socket-target', USER_ID);
    connections.addRoomSubscription('socket-target', ROOM_ID);
    const service = createService(publisher, subscriber, connections);
    service.attachServer({
      sockets: {
        sockets: new Map([['socket-target', { data: { userId: USER_ID }, leave, emit }]]),
      },
    } as unknown as Server);

    handler?.({
      version: 1,
      event: DISTRIBUTED_REALTIME_EVENTS.MEMBER_REMOVED,
      originInstanceId: 'other-instance',
      occurredAt: '2026-08-22T00:00:00.000Z',
      roomId: ROOM_ID,
      userId: USER_ID,
      payload: { roomId: ROOM_ID, userId: USER_ID },
    });

    expect(leave).toHaveBeenCalledWith(ROOM_ID);
    expect(emit).toHaveBeenCalledWith(SERVER_SOCKET_EVENTS.ROOM_LEFT, { roomId: ROOM_ID });
    expect(connections.getRoomSubscriptions('socket-target')).toEqual([]);
    expect(publish).not.toHaveBeenCalled();
  });
});
