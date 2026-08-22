import { Inject, Injectable } from '@nestjs/common';

import type { RedisClient } from '../../infrastructure/redis/redis-client.interface.js';
import { REDIS_CLIENT } from '../../infrastructure/tokens.js';
import type {
  ConnectionChangeResult,
  PresenceStore,
  UserPresenceSnapshot,
} from '../presence.store.interface.js';

export function presenceUserKey(userId: string): string {
  return `presence:user:${userId}`;
}

export function presenceSessionKey(socketId: string): string {
  return `presence:session:${socketId}`;
}

export function presenceUserSessionsKey(userId: string): string {
  return `presence:user:${userId}:sessions`;
}

interface StoredUserPresence {
  readonly status: 'online';
  readonly lastSeen: string;
  readonly instanceId: string;
}

@Injectable()
export class RedisPresenceStore implements PresenceStore {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisClient) {}

  async addConnection(
    userId: string,
    socketId: string,
    lastSeenAt: Date,
    ttlSeconds: number,
    instanceId: string,
  ): Promise<ConnectionChangeResult> {
    await this.redis.set(presenceSessionKey(socketId), userId, ttlSeconds);
    await this.redis.sadd(presenceUserSessionsKey(userId), socketId);
    await this.pruneExpiredSessions(userId);
    await this.writeUserPresence(userId, lastSeenAt, ttlSeconds, instanceId);

    return {
      connectionCount: await this.countValidSessions(userId),
      lastSeenAt,
    };
  }

  async removeConnection(
    userId: string,
    socketId: string,
    ttlSeconds: number,
  ): Promise<ConnectionChangeResult> {
    await this.redis.del(presenceSessionKey(socketId));
    await this.redis.srem(presenceUserSessionsKey(userId), socketId);
    const socketIds = (await this.pruneExpiredSessions(userId)).filter(
      (remainingId) => remainingId !== socketId,
    );
    const lastSeenAt = (await this.readLastSeenAt(userId)) ?? new Date();

    if (socketIds.length === 0) {
      await this.clearUser(userId);
      return { connectionCount: 0, lastSeenAt };
    }

    const existing = await this.readStoredPresence(userId);
    await this.writeUserPresence(userId, lastSeenAt, ttlSeconds, existing?.instanceId ?? 'unknown');

    return { connectionCount: socketIds.length, lastSeenAt };
  }

  async refreshConnection(
    userId: string,
    socketId: string,
    lastSeenAt: Date,
    ttlSeconds: number,
    instanceId: string,
  ): Promise<boolean> {
    const sessionExists = (await this.redis.exists(presenceSessionKey(socketId))) === 1;
    if (!sessionExists) {
      return false;
    }

    await this.redis.expire(presenceSessionKey(socketId), ttlSeconds);
    await this.redis.expire(presenceUserSessionsKey(userId), ttlSeconds);
    await this.writeUserPresence(userId, lastSeenAt, ttlSeconds, instanceId);
    return true;
  }

  async getPresence(userId: string): Promise<UserPresenceSnapshot | null> {
    const stored = await this.readStoredPresence(userId);
    if (stored === null) {
      return null;
    }

    const socketIds = await this.pruneExpiredSessions(userId);
    if (socketIds.length === 0) {
      await this.clearUser(userId);
      return null;
    }

    return {
      userId,
      status: 'online',
      lastSeenAt: new Date(stored.lastSeen),
      instanceId: stored.instanceId,
      socketIds,
    };
  }

  async getPresenceMany(userIds: readonly string[]): Promise<Map<string, UserPresenceSnapshot>> {
    const uniqueIds = [...new Set(userIds)];
    const snapshots = new Map<string, UserPresenceSnapshot>();
    if (uniqueIds.length === 0) {
      return snapshots;
    }

    const values = await this.redis.mget(...uniqueIds.map((userId) => presenceUserKey(userId)));
    const candidates: { readonly userId: string; readonly stored: StoredUserPresence }[] = [];

    for (let index = 0; index < uniqueIds.length; index += 1) {
      const userId = uniqueIds[index];
      const raw = values[index];
      if (userId === undefined || raw === null || raw === undefined) {
        continue;
      }

      const stored = parseStoredPresence(raw);
      if (stored === null) {
        continue;
      }

      candidates.push({ userId, stored });
    }

    await Promise.all(
      candidates.map(async ({ userId, stored }) => {
        const socketIds = await this.pruneExpiredSessions(userId);
        if (socketIds.length === 0) {
          await this.clearUser(userId);
          return;
        }

        snapshots.set(userId, {
          userId,
          status: 'online',
          lastSeenAt: new Date(stored.lastSeen),
          instanceId: stored.instanceId,
          socketIds,
        });
      }),
    );

    return snapshots;
  }

  async clearUser(userId: string): Promise<void> {
    const socketIds = await this.redis.smembers(presenceUserSessionsKey(userId));
    const sessionKeys = socketIds.map((socketId) => presenceSessionKey(socketId));
    await this.redis.del(presenceUserKey(userId), presenceUserSessionsKey(userId), ...sessionKeys);
  }

  private async writeUserPresence(
    userId: string,
    lastSeenAt: Date,
    ttlSeconds: number,
    instanceId: string,
  ): Promise<void> {
    const payload: StoredUserPresence = {
      status: 'online',
      lastSeen: lastSeenAt.toISOString(),
      instanceId,
    };

    await this.redis.set(presenceUserKey(userId), JSON.stringify(payload), ttlSeconds);
    await this.redis.expire(presenceUserSessionsKey(userId), ttlSeconds);
  }

  private async pruneExpiredSessions(userId: string): Promise<string[]> {
    const socketIds = await this.redis.smembers(presenceUserSessionsKey(userId));
    if (socketIds.length === 0) {
      return [];
    }

    const values = await this.redis.mget(
      ...socketIds.map((socketId) => presenceSessionKey(socketId)),
    );
    const valid: string[] = [];
    const stale: string[] = [];

    for (let index = 0; index < socketIds.length; index += 1) {
      const socketId = socketIds[index];
      if (socketId === undefined) {
        continue;
      }
      if (values[index] === null) {
        stale.push(socketId);
      } else {
        valid.push(socketId);
      }
    }

    if (stale.length > 0) {
      await this.redis.srem(presenceUserSessionsKey(userId), ...stale);
    }

    return valid;
  }

  private async countValidSessions(userId: string): Promise<number> {
    return (await this.pruneExpiredSessions(userId)).length;
  }

  private async readLastSeenAt(userId: string): Promise<Date | null> {
    const stored = await this.readStoredPresence(userId);
    if (stored === null) {
      return null;
    }

    return new Date(stored.lastSeen);
  }

  private async readStoredPresence(userId: string): Promise<StoredUserPresence | null> {
    const raw = await this.redis.get(presenceUserKey(userId));
    if (raw === null) {
      return null;
    }

    return parseStoredPresence(raw);
  }
}

function parseStoredPresence(raw: string): StoredUserPresence | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) {
      return null;
    }

    const record = value as Record<string, unknown>;
    if (
      record['status'] !== 'online' ||
      typeof record['lastSeen'] !== 'string' ||
      typeof record['instanceId'] !== 'string'
    ) {
      return null;
    }

    return {
      status: 'online',
      lastSeen: record['lastSeen'],
      instanceId: record['instanceId'],
    };
  } catch {
    return null;
  }
}
