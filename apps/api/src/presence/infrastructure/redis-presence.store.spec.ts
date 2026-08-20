import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TestRedisService } from '../../test/test-redis.service.js';
import { presenceSessionKey, presenceUserKey, RedisPresenceStore } from './redis-presence.store.js';

const INSTANCE_ID = 'test-instance';

function id(): string {
  return randomUUID().replaceAll('-', '').slice(0, 24);
}

describe('RedisPresenceStore', () => {
  let redis: TestRedisService;
  let store: RedisPresenceStore;
  let userId: string;
  let socketA: string;
  let socketB: string;
  const lastSeenAt = new Date('2026-08-18T12:00:00.000Z');

  beforeEach(async () => {
    redis = new TestRedisService();
    await redis.onModuleInit();
    store = new RedisPresenceStore(redis);
    userId = id();
    socketA = `socket-${id()}`;
    socketB = `socket-${id()}`;
  });

  afterEach(async () => {
    await redis.onModuleDestroy();
  });

  it('tracks the first connection as online presence', async () => {
    const result = await store.addConnection(userId, socketA, lastSeenAt, 45, INSTANCE_ID);
    const presence = await store.getPresence(userId);

    expect(result.connectionCount).toBe(1);
    expect(presence).toMatchObject({
      userId,
      status: 'online',
      instanceId: INSTANCE_ID,
      socketIds: [socketA],
    });
    expect(presence?.lastSeenAt.toISOString()).toBe(lastSeenAt.toISOString());
  });

  it('tracks a second device without dropping the first session', async () => {
    await store.addConnection(userId, socketA, lastSeenAt, 45, INSTANCE_ID);
    const result = await store.addConnection(userId, socketB, lastSeenAt, 45, INSTANCE_ID);
    const presence = await store.getPresence(userId);

    expect(result.connectionCount).toBe(2);
    expect(presence?.socketIds).toEqual(expect.arrayContaining([socketA, socketB]));
  });

  it('keeps the user online after removing one of two sessions', async () => {
    await store.addConnection(userId, socketA, lastSeenAt, 45, INSTANCE_ID);
    await store.addConnection(userId, socketB, lastSeenAt, 45, INSTANCE_ID);

    const result = await store.removeConnection(userId, socketA, 45);
    const presence = await store.getPresence(userId);

    expect(result.connectionCount).toBe(1);
    expect(presence?.socketIds).toEqual([socketB]);
  });

  it('clears presence when the last session is removed', async () => {
    await store.addConnection(userId, socketA, lastSeenAt, 45, INSTANCE_ID);

    const result = await store.removeConnection(userId, socketA, 45);

    expect(result.connectionCount).toBe(0);
    expect(await store.getPresence(userId)).toBeNull();
  });

  it('treats TTL expiration as offline without a disconnect', async () => {
    await store.addConnection(userId, socketA, lastSeenAt, 45, INSTANCE_ID);

    await redis.expire(presenceUserKey(userId), 0);
    await redis.expire(presenceSessionKey(socketA), 0);

    expect(await store.getPresence(userId)).toBeNull();
  });

  it('prunes a stale session whose TTL elapsed while another device remains', async () => {
    await store.addConnection(userId, socketA, lastSeenAt, 45, INSTANCE_ID);
    await store.addConnection(userId, socketB, lastSeenAt, 45, INSTANCE_ID);

    await redis.expire(presenceSessionKey(socketA), 0);
    const presence = await store.getPresence(userId);

    expect(presence?.socketIds).toEqual([socketB]);
  });

  it('refreshes a live session TTL and lastSeen', async () => {
    await store.addConnection(userId, socketA, lastSeenAt, 45, INSTANCE_ID);
    const later = new Date('2026-08-18T12:01:00.000Z');

    const refreshed = await store.refreshConnection(userId, socketA, later, 45, INSTANCE_ID);
    const presence = await store.getPresence(userId);

    expect(refreshed).toBe(true);
    expect(presence?.lastSeenAt.toISOString()).toBe(later.toISOString());
  });

  it('reports a missing session as not refreshed after TTL expiration', async () => {
    await store.addConnection(userId, socketA, lastSeenAt, 45, INSTANCE_ID);
    await redis.expire(presenceSessionKey(socketA), 0);

    expect(await store.refreshConnection(userId, socketA, lastSeenAt, 45, INSTANCE_ID)).toBe(false);
  });
});
