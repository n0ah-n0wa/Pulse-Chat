import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import RedisMock from 'ioredis-mock';

import {
  INCREMENT_WITH_TTL_LUA,
  parseIncrementWithTtlResult,
} from '../infrastructure/redis/increment-with-ttl.js';
import { IoredisSubscriberAdapter } from '../infrastructure/redis/ioredis-subscriber.adapter.js';
import type {
  RedisClient,
  RedisHealthProbe,
} from '../infrastructure/redis/redis-client.interface.js';
import type { RedisSubscriber } from '../infrastructure/redis/redis-subscriber.interface.js';

/**
 * In-memory Redis stand-in for unit and integration tests.
 *
 * Pub/Sub and keyspace are those of the underlying ioredis-mock client.
 * Inject the same instance into multiple Nest applications (via `useValue`)
 * to exercise a shared Redis, including cross-instance Pub/Sub. Call
 * {@link detachLifecycle} so Nest does not quit the client when the first
 * app closes.
 */
export class TestRedisService
  implements RedisClient, RedisHealthProbe, OnModuleInit, OnModuleDestroy
{
  private readonly client = new RedisMock();
  private closed = false;
  private ownsLifecycle = true;
  readonly publishedChannels: string[] = [];
  private publishFailuresRemaining = 0;

  /** Keep the client open across multiple Nest application lifetimes. */
  detachLifecycle(): this {
    this.ownsLifecycle = false;
    return this;
  }

  /** Next `count` publish calls fail with a transient Redis error. */
  failNextPublishes(count: number): void {
    this.publishFailuresRemaining = count;
  }

  async onModuleInit(): Promise<void> {
    // ioredis-mock connects synchronously; nothing to do.
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.ownsLifecycle) {
      return;
    }

    await this.dispose();
  }

  async dispose(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;
    await this.client.quit();
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

  async mget(...keys: string[]): Promise<(string | null)[]> {
    if (keys.length === 0) {
      return [];
    }

    return this.client.mget(...keys);
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

  async incrementWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const result: unknown = await this.client.eval(
      INCREMENT_WITH_TTL_LUA,
      1,
      key,
      String(ttlSeconds),
    );
    return parseIncrementWithTtlResult(result);
  }

  async publish(channel: string, message: string): Promise<number> {
    if (this.publishFailuresRemaining > 0) {
      this.publishFailuresRemaining -= 1;
      throw new Error('Redis is temporarily unavailable');
    }

    this.publishedChannels.push(channel);
    return this.client.publish(channel, message);
  }

  createSubscriber(): Promise<RedisSubscriber> {
    return Promise.resolve(new IoredisSubscriberAdapter(this.client.duplicate()));
  }
}
