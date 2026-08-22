import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { hostname } from 'node:os';

import { AppConfigService } from '../../config/index.js';
import { StructuredLoggerService } from '../logging/structured-logger.service.js';
import { REDIS_CLIENT, REDIS_HEALTH_PROBE } from '../tokens.js';
import { INCREMENT_WITH_TTL_LUA, parseIncrementWithTtlResult } from './increment-with-ttl.js';
import { IoredisSubscriberAdapter } from './ioredis-subscriber.adapter.js';
import type { RedisClient, RedisHealthProbe } from './redis-client.interface.js';
import { withRedisRetry } from './redis-retry.js';
import type { RedisSubscriber } from './redis-subscriber.interface.js';

@Injectable()
export class RedisService implements RedisClient, RedisHealthProbe, OnModuleInit, OnModuleDestroy {
  private client!: Redis;
  private shuttingDown = false;

  constructor(
    private readonly config: AppConfigService,
    private readonly logger: StructuredLoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.client = new Redis(this.config.redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      connectionName: `pulse-api-${hostname()}`,
      retryStrategy: (times: number) => Math.min(times * 200, 3000),
      reconnectOnError: (error: Error) => {
        const message = error.message.toUpperCase();
        return message.includes('READONLY') || message.includes('ETIMEDOUT');
      },
    });

    this.client.on('error', (error: Error) => {
      this.logger.error('redis.error', { error });
    });

    this.client.on('close', () => {
      if (!this.shuttingDown) {
        this.logger.warn('redis.disconnected');
      }
    });

    await this.client.connect();
    this.logger.log('redis.connected');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status === 'end') {
      return;
    }

    this.shuttingDown = true;
    await this.client.quit();
    this.logger.log('redis.closed');
  }

  async check(): Promise<void> {
    await this.ping();
  }

  async ping(): Promise<'PONG'> {
    const response = await this.run(() => this.client.ping());
    if (response !== 'PONG') {
      throw new Error(`Unexpected Redis PING response: ${String(response)}`);
    }
    return 'PONG';
  }

  async get(key: string): Promise<string | null> {
    return this.run(() => this.client.get(key));
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds === undefined) {
      await this.run(() => this.client.set(key, value));
      return;
    }

    await this.run(() => this.client.set(key, value, 'EX', ttlSeconds));
  }

  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) {
      return 0;
    }

    return this.run(() => this.client.del(...keys));
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    if (ttlSeconds <= 0) {
      return (await this.del(key)) > 0;
    }

    return (await this.run(() => this.client.expire(key, ttlSeconds))) === 1;
  }

  async exists(...keys: string[]): Promise<number> {
    if (keys.length === 0) {
      return 0;
    }

    return this.run(() => this.client.exists(...keys));
  }

  async mget(...keys: string[]): Promise<(string | null)[]> {
    if (keys.length === 0) {
      return [];
    }

    return this.run(() => this.client.mget(...keys));
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    if (members.length === 0) {
      return 0;
    }

    return this.run(() => this.client.sadd(key, ...members));
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    if (members.length === 0) {
      return 0;
    }

    return this.run(() => this.client.srem(key, ...members));
  }

  async smembers(key: string): Promise<string[]> {
    return this.run(() => this.client.smembers(key));
  }

  async scard(key: string): Promise<number> {
    return this.run(() => this.client.scard(key));
  }

  /**
   * Increments a counter and sets its TTL only when the key is first created,
   * giving a fixed-window rate limit.
   */
  async incrementWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const result = await this.run(() =>
      this.client.eval(INCREMENT_WITH_TTL_LUA, 1, key, String(ttlSeconds)),
    );

    return parseIncrementWithTtlResult(result);
  }

  async publish(channel: string, message: string): Promise<number> {
    return this.run(() => this.client.publish(channel, message));
  }

  createSubscriber(): Promise<RedisSubscriber> {
    const subscriber = this.client.duplicate({
      connectionName: `pulse-api-sub-${hostname()}`,
      lazyConnect: true,
      retryStrategy: (times: number) => Math.min(times * 200, 3000),
    });

    subscriber.on('error', (error: Error) => {
      this.logger.error('redis.subscriber_error', { error });
    });

    return Promise.resolve(new IoredisSubscriberAdapter(subscriber));
  }

  private run<T>(operation: () => Promise<T>): Promise<T> {
    return withRedisRetry(operation);
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
