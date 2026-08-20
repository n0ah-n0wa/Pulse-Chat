import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { hostname } from 'node:os';

import { AppConfigService } from '../../config/index.js';
import { NestStructuredLoggerService } from '../logging/nest-structured-logger.service.js';
import { REDIS_CLIENT, REDIS_HEALTH_PROBE } from '../tokens.js';
import type { RedisClient, RedisHealthProbe } from './redis-client.interface.js';
import { IoredisSubscriberAdapter } from './ioredis-subscriber.adapter.js';
import type { RedisSubscriber } from './redis-subscriber.interface.js';

@Injectable()
export class RedisService implements RedisClient, RedisHealthProbe, OnModuleInit, OnModuleDestroy {
  private client!: Redis;

  constructor(
    private readonly config: AppConfigService,
    private readonly logger: NestStructuredLoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.client = new Redis(this.config.redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      connectionName: `pulse-api-${hostname()}`,
    });

    this.client.on('error', (error: Error) => {
      this.logger.error('Redis client error', error.stack, RedisService.name);
    });

    await this.client.connect();
    this.logger.log('Redis connection established', RedisService.name);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status === 'end') {
      return;
    }

    await this.client.quit();
    this.logger.log('Redis connection closed', RedisService.name);
  }

  async check(): Promise<void> {
    await this.ping();
  }

  async ping(): Promise<'PONG'> {
    const response = await this.client.ping();
    if (response !== 'PONG') {
      throw new Error(`Unexpected Redis PING response: ${String(response)}`);
    }
    return 'PONG';
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds === undefined) {
      await this.client.set(key, value);
      return;
    }

    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) {
      return 0;
    }

    return this.client.del(...keys);
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    if (ttlSeconds <= 0) {
      return (await this.client.del(key)) > 0;
    }

    return (await this.client.expire(key, ttlSeconds)) === 1;
  }

  async exists(...keys: string[]): Promise<number> {
    if (keys.length === 0) {
      return 0;
    }

    return this.client.exists(...keys);
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    if (members.length === 0) {
      return 0;
    }

    return this.client.sadd(key, ...members);
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    if (members.length === 0) {
      return 0;
    }

    return this.client.srem(key, ...members);
  }

  async smembers(key: string): Promise<string[]> {
    return this.client.smembers(key);
  }

  async scard(key: string): Promise<number> {
    return this.client.scard(key);
  }

  /**
   * Increments a counter and sets its TTL only when the key is first created,
   * giving a fixed-window rate limit.
   */
  async incrementWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const count = await this.client.incr(key);

    if (count === 1) {
      await this.client.expire(key, ttlSeconds);
    }

    return count;
  }

  async publish(channel: string, message: string): Promise<number> {
    return this.client.publish(channel, message);
  }

  createSubscriber(): Promise<RedisSubscriber> {
    const subscriber = this.client.duplicate({
      connectionName: `pulse-api-sub-${hostname()}`,
      lazyConnect: true,
    });

    subscriber.on('error', (error: Error) => {
      this.logger.error('Redis subscriber error', error.stack, RedisService.name);
    });

    return Promise.resolve(new IoredisSubscriberAdapter(subscriber));
  }
}

export const redisProviders = [
  RedisService,
  {
    provide: REDIS_CLIENT,
    useExisting: RedisService,
  },
  {
    provide: REDIS_HEALTH_PROBE,
    useExisting: RedisService,
  },
] as const;
