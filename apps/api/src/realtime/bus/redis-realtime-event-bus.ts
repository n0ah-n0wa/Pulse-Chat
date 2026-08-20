import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { APP_INSTANCE_ID } from '../../config/index.js';
import { NestStructuredLoggerService } from '../../infrastructure/logging/nest-structured-logger.service.js';
import type { RedisClient } from '../../infrastructure/redis/redis-client.interface.js';
import type { RedisSubscriber } from '../../infrastructure/redis/redis-subscriber.interface.js';
import { REDIS_CLIENT } from '../../infrastructure/tokens.js';
import { ALL_REALTIME_BUS_CHANNELS, channelForDistributedEvent } from './realtime-bus.channels.js';
import {
  deserializeRealtimeBusEnvelope,
  serializeRealtimeBusEnvelope,
  type PublishRealtimeEventInput,
} from './realtime-bus.envelope.js';
import type { RealtimeEventPublisher } from './realtime-event-publisher.interface.js';
import type {
  RealtimeEventHandler,
  RealtimeEventSubscriber,
} from './realtime-event-subscriber.interface.js';

/**
 * Redis Pub/Sub adapter for distributed realtime events.
 *
 * Business modules depend on {@link RealtimeEventPublisher} /
 * {@link RealtimeEventSubscriber}, not on this class or ioredis.
 */
@Injectable()
export class RedisRealtimeEventBus
  implements RealtimeEventPublisher, RealtimeEventSubscriber, OnModuleInit, OnModuleDestroy
{
  private subscriber: RedisSubscriber | undefined;
  private handler: RealtimeEventHandler | undefined;
  private subscribedChannels: readonly string[] = ALL_REALTIME_BUS_CHANNELS;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
    @Inject(APP_INSTANCE_ID) private readonly instanceId: string,
    private readonly logger: NestStructuredLoggerService,
  ) {}

  onEvent(handler: RealtimeEventHandler): void {
    if (this.handler !== undefined) {
      this.logger.warn(
        'onEvent() called more than once — previous handler replaced. ' +
          'Only one subscriber is supported per RedisRealtimeEventBus instance.',
        RedisRealtimeEventBus.name,
      );
    }

    this.handler = handler;
  }

  async onModuleInit(): Promise<void> {
    this.subscriber = await this.redis.createSubscriber();
    this.subscriber.onMessage((channel, message) => {
      this.handleMessage(channel, message);
    });
    this.subscriber.onReconnect(() => {
      void this.resubscribe();
    });
    await this.subscriber.subscribe(this.subscribedChannels);
    this.logger.log('Realtime event bus subscribed', RedisRealtimeEventBus.name);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.subscriber === undefined) {
      return;
    }

    await this.subscriber.unsubscribe();
    await this.subscriber.quit();
    this.subscriber = undefined;
  }

  async publish(event: PublishRealtimeEventInput): Promise<void> {
    const channel = channelForDistributedEvent(event.event);
    const serialized = serializeRealtimeBusEnvelope(event, this.instanceId);
    await this.redis.publish(channel, serialized);
  }

  private handleMessage(_channel: string, raw: string): void {
    const envelope = deserializeRealtimeBusEnvelope(raw);
    if (envelope === null) {
      this.logger.warn('Ignored malformed realtime bus payload', RedisRealtimeEventBus.name);
      return;
    }

    if (envelope.originInstanceId === this.instanceId) {
      return;
    }

    this.handler?.(envelope);
  }

  private async resubscribe(): Promise<void> {
    if (this.subscriber === undefined) {
      return;
    }

    try {
      await this.subscriber.subscribe(this.subscribedChannels);
      this.logger.log(
        'Realtime event bus resubscribed after reconnect',
        RedisRealtimeEventBus.name,
      );
    } catch (error) {
      this.logger.error(
        'Failed to resubscribe realtime event bus',
        error instanceof Error ? error.stack : undefined,
        RedisRealtimeEventBus.name,
      );
    }
  }
}
