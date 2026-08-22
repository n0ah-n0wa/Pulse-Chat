import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NestStructuredLoggerService } from '../../infrastructure/logging/nest-structured-logger.service.js';
import type { RedisClient } from '../../infrastructure/redis/redis-client.interface.js';
import type { RedisSubscriber } from '../../infrastructure/redis/redis-subscriber.interface.js';
import { TestRedisService } from '../../test/test-redis.service.js';
import {
  channelForDistributedEvent,
  DISTRIBUTED_REALTIME_EVENTS,
  REALTIME_BUS_CHANNELS,
} from './realtime-bus.channels.js';
import { RedisRealtimeEventBus } from './redis-realtime-event-bus.js';

class InMemoryBroker {
  private readonly listeners = new Map<string, Set<(channel: string, message: string) => void>>();
  readonly published: { channel: string; message: string }[] = [];

  publish(channel: string, message: string): number {
    this.published.push({ channel, message });
    const listeners = this.listeners.get(channel);
    if (listeners === undefined) {
      return 0;
    }

    for (const listener of listeners) {
      listener(channel, message);
    }

    return listeners.size;
  }

  add(channel: string, listener: (channel: string, message: string) => void): void {
    const listeners = this.listeners.get(channel) ?? new Set();
    listeners.add(listener);
    this.listeners.set(channel, listeners);
  }

  remove(listener: (channel: string, message: string) => void): void {
    for (const listeners of this.listeners.values()) {
      listeners.delete(listener);
    }
  }
}

class InMemorySubscriber implements RedisSubscriber {
  private connected = true;
  private readonly subscribed = new Set<string>();
  private messageListener: ((channel: string, message: string) => void) | undefined;
  private reconnectListener: (() => void) | undefined;
  private subscribeFailuresRemaining = 0;

  constructor(private readonly broker: InMemoryBroker) {}

  failNextSubscribes(count: number): void {
    this.subscribeFailuresRemaining = count;
  }

  subscribe(channels: readonly string[]): Promise<void> {
    if (this.subscribeFailuresRemaining > 0) {
      this.subscribeFailuresRemaining -= 1;
      return Promise.reject(new Error('Subscriber is disconnected.'));
    }

    if (!this.connected) {
      return Promise.reject(new Error('Subscriber is disconnected.'));
    }

    for (const channel of channels) {
      this.subscribed.add(channel);
      if (this.messageListener !== undefined) {
        this.broker.add(channel, this.messageListener);
      }
    }

    return Promise.resolve();
  }

  unsubscribe(): Promise<void> {
    if (this.messageListener !== undefined) {
      this.broker.remove(this.messageListener);
    }

    this.subscribed.clear();
    return Promise.resolve();
  }

  onMessage(listener: (channel: string, message: string) => void): void {
    this.messageListener = listener;
  }

  onReconnect(listener: () => void): void {
    this.reconnectListener = listener;
  }

  disconnect(): void {
    this.connected = false;
    if (this.messageListener !== undefined) {
      this.broker.remove(this.messageListener);
    }
  }

  connect(): Promise<void> {
    this.connected = true;
    this.reconnectListener?.();
    return Promise.resolve();
  }

  quit(): Promise<void> {
    this.disconnect();
    return Promise.resolve();
  }
}

class InMemoryRedisClient implements Pick<RedisClient, 'publish' | 'createSubscriber'> {
  constructor(private readonly broker: InMemoryBroker) {}

  publish(channel: string, message: string): Promise<number> {
    return Promise.resolve(this.broker.publish(channel, message));
  }

  createSubscriber(): Promise<RedisSubscriber> {
    return Promise.resolve(new InMemorySubscriber(this.broker));
  }
}

function createLogger(): {
  logger: NestStructuredLoggerService;
  warn: ReturnType<typeof vi.fn>;
} {
  const warn = vi.fn();
  return {
    warn,
    logger: {
      log: vi.fn(),
      warn,
      error: vi.fn(),
    } as unknown as NestStructuredLoggerService,
  };
}

async function createBus(
  instanceId: string,
  redis: Pick<RedisClient, 'publish' | 'createSubscriber'>,
  logger = createLogger().logger,
): Promise<RedisRealtimeEventBus> {
  const bus = new RedisRealtimeEventBus(redis as RedisClient, instanceId, logger);
  await bus.onModuleInit();
  return bus;
}

describe('RedisRealtimeEventBus', () => {
  const receivedByA: unknown[] = [];
  const receivedByB: unknown[] = [];
  let broker: InMemoryBroker;
  let redis: InMemoryRedisClient;
  let instanceA: RedisRealtimeEventBus;
  let instanceB: RedisRealtimeEventBus;
  let loggerB: NestStructuredLoggerService;
  let warnB: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    receivedByA.length = 0;
    receivedByB.length = 0;
    broker = new InMemoryBroker();
    redis = new InMemoryRedisClient(broker);
    const createdLogger = createLogger();
    loggerB = createdLogger.logger;
    warnB = createdLogger.warn;
    instanceA = await createBus('instance-a', redis);
    instanceB = await createBus('instance-b', redis, loggerB);
    instanceA.onEvent((event) => receivedByA.push(event));
    instanceB.onEvent((event) => receivedByB.push(event));
  });

  afterEach(async () => {
    await instanceA.onModuleDestroy();
    await instanceB.onModuleDestroy();
  });

  it('delivers an event published by instance A to instance B', async () => {
    await instanceA.publish({
      event: DISTRIBUTED_REALTIME_EVENTS.MESSAGE_NEW,
      roomId: '507f1f77bcf86cd799439021',
      payload: { message: { id: 'msg-1' } },
    });

    expect(receivedByB).toHaveLength(1);
    expect(receivedByB[0]).toMatchObject({
      event: DISTRIBUTED_REALTIME_EVENTS.MESSAGE_NEW,
      originInstanceId: 'instance-a',
      roomId: '507f1f77bcf86cd799439021',
      payload: { message: { id: 'msg-1' } },
    });
  });

  it("does not re-dispatch an instance's own events, preventing publish loops", async () => {
    await instanceA.publish({
      event: DISTRIBUTED_REALTIME_EVENTS.USER_ONLINE,
      userId: '507f1f77bcf86cd799439011',
      payload: { userId: '507f1f77bcf86cd799439011', lastSeenAt: '2026-08-18T12:00:00.000Z' },
    });

    expect(receivedByA).toHaveLength(0);
    expect(receivedByB).toHaveLength(1);
  });

  it('routes each event family onto its dedicated channel', async () => {
    await instanceA.publish({
      event: DISTRIBUTED_REALTIME_EVENTS.MESSAGE_UPDATED,
      roomId: 'room-1',
      payload: { message: { id: 'msg-2' } },
    });
    await instanceA.publish({
      event: DISTRIBUTED_REALTIME_EVENTS.REACTION_ADDED,
      roomId: 'room-1',
      payload: { emoji: '👍' },
    });
    await instanceA.publish({
      event: DISTRIBUTED_REALTIME_EVENTS.USER_OFFLINE,
      userId: 'user-1',
      payload: { userId: 'user-1' },
    });
    await instanceA.publish({
      event: DISTRIBUTED_REALTIME_EVENTS.NOTIFICATION_NEW,
      userId: 'user-1',
      payload: { notification: { id: 'n-1', userId: 'user-1' } },
    });

    expect(broker.published.map((entry) => entry.channel)).toEqual([
      channelForDistributedEvent(DISTRIBUTED_REALTIME_EVENTS.MESSAGE_UPDATED),
      REALTIME_BUS_CHANNELS.REACTION,
      REALTIME_BUS_CHANNELS.PRESENCE,
      REALTIME_BUS_CHANNELS.NOTIFICATION,
    ]);
    expect(receivedByB).toHaveLength(4);
    expect(receivedByB.map((event) => (event as { event: string }).event)).toEqual([
      DISTRIBUTED_REALTIME_EVENTS.MESSAGE_UPDATED,
      DISTRIBUTED_REALTIME_EVENTS.REACTION_ADDED,
      DISTRIBUTED_REALTIME_EVENTS.USER_OFFLINE,
      DISTRIBUTED_REALTIME_EVENTS.NOTIFICATION_NEW,
    ]);
  });

  it('ignores malformed payloads without interrupting later events', async () => {
    await redis.publish(REALTIME_BUS_CHANNELS.MESSAGE, '{not-json');
    await redis.publish(REALTIME_BUS_CHANNELS.MESSAGE, JSON.stringify({ version: 1 }));
    await instanceA.publish({
      event: DISTRIBUTED_REALTIME_EVENTS.MESSAGE_DELETED,
      roomId: 'room-1',
      payload: { message: { id: 'msg-3' } },
    });

    expect(warnB).toHaveBeenCalled();
    expect(receivedByB).toHaveLength(1);
    expect(receivedByB[0]).toMatchObject({
      event: DISTRIBUTED_REALTIME_EVENTS.MESSAGE_DELETED,
    });
  });

  it('resubscribes after a Redis disconnect and reconnect', async () => {
    const subscriberB = (instanceB as unknown as { subscriber: InMemorySubscriber }).subscriber;

    subscriberB.disconnect();
    await instanceA.publish({
      event: DISTRIBUTED_REALTIME_EVENTS.MESSAGE_NEW,
      roomId: 'room-1',
      payload: { missed: true },
    });
    expect(receivedByB).toHaveLength(0);

    await subscriberB.connect();
    await instanceA.publish({
      event: DISTRIBUTED_REALTIME_EVENTS.MESSAGE_NEW,
      roomId: 'room-1',
      payload: { recovered: true },
    });

    expect(receivedByB).toHaveLength(1);
    expect(receivedByB[0]).toMatchObject({ payload: { recovered: true } });
  });

  it('retries a failed Redis resubscribe after a reconnect', async () => {
    const subscriberB = (instanceB as unknown as { subscriber: InMemorySubscriber }).subscriber;
    subscriberB.failNextSubscribes(1);

    await subscriberB.connect();
    await new Promise((resolve) => {
      setTimeout(resolve, 80);
    });
    await instanceA.publish({
      event: DISTRIBUTED_REALTIME_EVENTS.MESSAGE_NEW,
      roomId: 'room-1',
      payload: { afterRetry: true },
    });

    expect(receivedByB).toHaveLength(1);
    expect(receivedByB[0]).toMatchObject({ payload: { afterRetry: true } });
  });

  it('retries a transient Redis publish failure then delivers the event', async () => {
    let remainingFailures = 2;
    const originalPublish = redis.publish.bind(redis);
    redis.publish = (channel: string, message: string) => {
      if (remainingFailures > 0) {
        remainingFailures -= 1;
        return Promise.reject(new Error('Redis is temporarily unavailable'));
      }

      return originalPublish(channel, message);
    };

    await instanceA.publish({
      event: DISTRIBUTED_REALTIME_EVENTS.MESSAGE_NEW,
      roomId: 'room-1',
      payload: { recovered: true },
    });

    expect(receivedByB).toHaveLength(1);
    expect(receivedByB[0]).toMatchObject({ payload: { recovered: true } });
  });
});

describe('RedisRealtimeEventBus with ioredis-mock', () => {
  it('propagates a message from one subscriber client to another', async () => {
    const redis = new TestRedisService();
    await redis.onModuleInit();
    const logger = createLogger().logger;
    const instanceA = await createBus('mock-a', redis, logger);
    const instanceB = await createBus('mock-b', redis, logger);
    const received: unknown[] = [];
    instanceB.onEvent((event) => received.push(event));

    try {
      await instanceA.publish({
        event: DISTRIBUTED_REALTIME_EVENTS.REACTION_REMOVED,
        roomId: '507f1f77bcf86cd799439021',
        payload: { emoji: '🎉' },
      });

      await waitFor(() => received.length === 1);
      expect(received[0]).toMatchObject({
        event: DISTRIBUTED_REALTIME_EVENTS.REACTION_REMOVED,
        originInstanceId: 'mock-a',
      });
    } finally {
      await instanceA.onModuleDestroy();
      await instanceB.onModuleDestroy();
      await redis.onModuleDestroy();
    }
  });
});

async function waitFor(condition: () => boolean, timeoutMs = 1000): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('Condition was not met in time.');
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
