import type { RedisSubscriber } from './redis-subscriber.interface.js';

/**
 * Platform-neutral Redis operations used by application and infrastructure
 * code. Business modules depend on this interface, not on ioredis directly.
 *
 * Connection lifecycle is owned by {@link RedisService}. Pub/Sub subscribe
 * traffic uses a dedicated client from {@link createSubscriber}.
 */
export interface RedisClient {
  ping(): Promise<'PONG'>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(...keys: string[]): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<boolean>;
  exists(...keys: string[]): Promise<number>;
  sadd(key: string, ...members: string[]): Promise<number>;
  srem(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  scard(key: string): Promise<number>;
  incrementWithTtl(key: string, ttlSeconds: number): Promise<number>;
  publish(channel: string, message: string): Promise<number>;
  createSubscriber(): Promise<RedisSubscriber>;
}

/** Minimal contract for Redis readiness probes. */
export interface RedisHealthProbe {
  check(): Promise<void>;
}
