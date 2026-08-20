import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { UsersService } from '../users/users.service.js';
import { PRESENCE_HEARTBEAT_INTERVAL_MS, PRESENCE_TTL_SECONDS } from './presence.constants.js';
import type {
  PresenceNotifier,
  PresenceOptions,
  PresenceStore,
  UserPresenceSnapshot,
} from './presence.store.interface.js';
import { PRESENCE_NOTIFIER, PRESENCE_OPTIONS, PRESENCE_STORE } from './presence.tokens.js';

@Injectable()
export class PresenceService implements OnModuleInit, OnModuleDestroy {
  private readonly socketsByUser = new Map<string, Set<string>>();
  private readonly userBySocket = new Map<string, string>();
  private readonly lastSeenByUser = new Map<string, Date>();
  private readonly publishedOnline = new Set<string>();
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    @Inject(PRESENCE_STORE) private readonly store: PresenceStore,
    private readonly users: UsersService,
    @Inject(PRESENCE_NOTIFIER) private readonly notifier: PresenceNotifier,
    @Inject(PRESENCE_OPTIONS) private readonly options: PresenceOptions,
  ) {}

  onModuleInit(): void {
    if (this.options.heartbeatIntervalMs <= 0) {
      return;
    }

    this.heartbeatTimer = setInterval(() => {
      void this.refreshTrackedConnections();
    }, this.options.heartbeatIntervalMs);
  }

  onModuleDestroy(): void {
    if (this.heartbeatTimer !== undefined) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  async connect(userId: string, socketId: string): Promise<UserPresenceSnapshot> {
    const lastSeenAt = new Date();
    const wasOnline = (await this.store.getPresence(userId)) !== null;
    const result = await this.store.addConnection(
      userId,
      socketId,
      lastSeenAt,
      this.options.ttlSeconds,
      this.options.instanceId,
    );

    this.trackSocket(userId, socketId, result.lastSeenAt);

    const snapshot = (await this.store.getPresence(userId)) ?? {
      userId,
      status: 'online' as const,
      lastSeenAt: result.lastSeenAt,
      instanceId: this.options.instanceId,
      socketIds: [...(this.socketsByUser.get(userId) ?? [])],
    };

    // Guard must be set before any await so a second concurrent connect()
    // call for the same user (multi-device) sees it immediately and does not
    // emit a duplicate user:online event.
    if (!wasOnline && !this.publishedOnline.has(userId)) {
      this.publishedOnline.add(userId);
      try {
        await this.users.recordLastSeen(userId, result.lastSeenAt);
        await this.notifier.notifyOnline({
          userId,
          lastSeenAt: result.lastSeenAt.toISOString(),
        });
      } catch (error) {
        // Roll back the guard so a subsequent connect() can retry the
        // notification if this one failed before publishing.
        this.publishedOnline.delete(userId);
        throw error;
      }
    }

    return snapshot;
  }

  async disconnect(userId: string, socketId: string): Promise<UserPresenceSnapshot | null> {
    this.untrackSocket(socketId);
    const result = await this.store.removeConnection(userId, socketId, this.options.ttlSeconds);
    this.lastSeenByUser.set(userId, result.lastSeenAt);

    if (result.connectionCount > 0) {
      return {
        userId,
        status: 'online',
        lastSeenAt: result.lastSeenAt,
        instanceId: this.options.instanceId,
        socketIds: [...(this.socketsByUser.get(userId) ?? [])],
      };
    }

    await this.markOffline(userId, result.lastSeenAt);
    return null;
  }

  async refreshTrackedConnections(): Promise<void> {
    const now = new Date();

    for (const [socketId, userId] of this.userBySocket.entries()) {
      const refreshed = await this.store.refreshConnection(
        userId,
        socketId,
        now,
        this.options.ttlSeconds,
        this.options.instanceId,
      );

      if (refreshed) {
        this.lastSeenByUser.set(userId, now);
        continue;
      }

      await this.store.addConnection(
        userId,
        socketId,
        now,
        this.options.ttlSeconds,
        this.options.instanceId,
      );
      this.lastSeenByUser.set(userId, now);
    }

    await this.sweepExpired();
  }

  async sweepExpired(): Promise<void> {
    const userIds = [...this.socketsByUser.keys()];

    for (const userId of userIds) {
      const presence = await this.store.getPresence(userId);
      if (presence !== null) {
        continue;
      }

      const lastSeenAt = this.lastSeenByUser.get(userId) ?? new Date();
      this.clearTrackedUser(userId);
      await this.markOffline(userId, lastSeenAt);
    }
  }

  async getPresence(userId: string): Promise<UserPresenceSnapshot | null> {
    return this.store.getPresence(userId);
  }

  async isOnline(userId: string): Promise<boolean> {
    return (await this.store.getPresence(userId)) !== null;
  }

  countLocalConnections(userId: string): number {
    return this.socketsByUser.get(userId)?.size ?? 0;
  }

  private async markOffline(userId: string, lastSeenAt: Date): Promise<void> {
    if (!this.publishedOnline.delete(userId)) {
      return;
    }

    await this.users.recordLastSeen(userId, lastSeenAt);
    this.lastSeenByUser.delete(userId);
    await this.notifier.notifyOffline({
      userId,
      lastSeenAt: lastSeenAt.toISOString(),
    });
  }

  private trackSocket(userId: string, socketId: string, lastSeenAt: Date): void {
    const sockets = this.socketsByUser.get(userId) ?? new Set<string>();
    sockets.add(socketId);
    this.socketsByUser.set(userId, sockets);
    this.userBySocket.set(socketId, userId);
    this.lastSeenByUser.set(userId, lastSeenAt);
  }

  private untrackSocket(socketId: string): void {
    const userId = this.userBySocket.get(socketId);
    this.userBySocket.delete(socketId);

    if (userId === undefined) {
      return;
    }

    const sockets = this.socketsByUser.get(userId);
    sockets?.delete(socketId);
    if (sockets?.size === 0) {
      this.socketsByUser.delete(userId);
    }
  }

  private clearTrackedUser(userId: string): void {
    const sockets = this.socketsByUser.get(userId);
    this.socketsByUser.delete(userId);

    if (sockets === undefined) {
      return;
    }

    for (const socketId of sockets) {
      this.userBySocket.delete(socketId);
    }
  }
}

export function createPresenceOptions(overrides: Partial<PresenceOptions> = {}): PresenceOptions {
  return {
    ttlSeconds: PRESENCE_TTL_SECONDS,
    heartbeatIntervalMs: PRESENCE_HEARTBEAT_INTERVAL_MS,
    instanceId: 'pulse-api',
    ...overrides,
  };
}
