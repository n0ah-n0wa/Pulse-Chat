import { describe, expect, it } from 'vitest';

import {
  ALL_REALTIME_BUS_CHANNELS,
  channelForDistributedEvent,
  DISTRIBUTED_REALTIME_EVENTS,
  REALTIME_BUS_CHANNELS,
  userSocketRoom,
} from './realtime-bus.channels.js';

describe('realtime bus channel naming', () => {
  it('routes message events onto the message channel', () => {
    expect(channelForDistributedEvent(DISTRIBUTED_REALTIME_EVENTS.MESSAGE_NEW)).toBe(
      REALTIME_BUS_CHANNELS.MESSAGE,
    );
    expect(channelForDistributedEvent(DISTRIBUTED_REALTIME_EVENTS.MESSAGE_UPDATED)).toBe(
      REALTIME_BUS_CHANNELS.MESSAGE,
    );
    expect(channelForDistributedEvent(DISTRIBUTED_REALTIME_EVENTS.MESSAGE_DELETED)).toBe(
      REALTIME_BUS_CHANNELS.MESSAGE,
    );
  });

  it('routes reaction, presence, and notification events onto dedicated channels', () => {
    expect(channelForDistributedEvent(DISTRIBUTED_REALTIME_EVENTS.REACTION_ADDED)).toBe(
      REALTIME_BUS_CHANNELS.REACTION,
    );
    expect(channelForDistributedEvent(DISTRIBUTED_REALTIME_EVENTS.REACTION_REMOVED)).toBe(
      REALTIME_BUS_CHANNELS.REACTION,
    );
    expect(channelForDistributedEvent(DISTRIBUTED_REALTIME_EVENTS.USER_ONLINE)).toBe(
      REALTIME_BUS_CHANNELS.PRESENCE,
    );
    expect(channelForDistributedEvent(DISTRIBUTED_REALTIME_EVENTS.USER_OFFLINE)).toBe(
      REALTIME_BUS_CHANNELS.PRESENCE,
    );
    expect(channelForDistributedEvent(DISTRIBUTED_REALTIME_EVENTS.NOTIFICATION_NEW)).toBe(
      REALTIME_BUS_CHANNELS.NOTIFICATION,
    );
    expect(channelForDistributedEvent(DISTRIBUTED_REALTIME_EVENTS.TYPING_STARTED)).toBe(
      REALTIME_BUS_CHANNELS.TYPING,
    );
    expect(channelForDistributedEvent(DISTRIBUTED_REALTIME_EVENTS.TYPING_STOPPED)).toBe(
      REALTIME_BUS_CHANNELS.TYPING,
    );
    expect(channelForDistributedEvent(DISTRIBUTED_REALTIME_EVENTS.MEMBER_REMOVED)).toBe(
      REALTIME_BUS_CHANNELS.MEMBERSHIP,
    );
  });

  it('uses the Socket.IO event names as distributed event names', () => {
    expect(DISTRIBUTED_REALTIME_EVENTS.MESSAGE_NEW).toBe('message:new');
    expect(DISTRIBUTED_REALTIME_EVENTS.REACTION_ADDED).toBe('reaction:added');
    expect(DISTRIBUTED_REALTIME_EVENTS.REACTION_REMOVED).toBe('reaction:removed');
    expect(DISTRIBUTED_REALTIME_EVENTS.NOTIFICATION_NEW).toBe('notification:new');
    expect(DISTRIBUTED_REALTIME_EVENTS.USER_ONLINE).toBe('user:online');
  });

  it('subscribes to every family channel', () => {
    expect(ALL_REALTIME_BUS_CHANNELS).toEqual([
      REALTIME_BUS_CHANNELS.MESSAGE,
      REALTIME_BUS_CHANNELS.REACTION,
      REALTIME_BUS_CHANNELS.PRESENCE,
      REALTIME_BUS_CHANNELS.NOTIFICATION,
      REALTIME_BUS_CHANNELS.TYPING,
      REALTIME_BUS_CHANNELS.MEMBERSHIP,
    ]);
  });

  it('names the personal socket room from the user id', () => {
    expect(userSocketRoom('507f1f77bcf86cd799439011')).toBe('user:507f1f77bcf86cd799439011');
  });
});
