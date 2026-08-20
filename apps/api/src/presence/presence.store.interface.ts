import type { UserOfflineEvent, UserOnlineEvent } from '@pulse-chat/shared';

/** Fan-out for presence events. Implementations must not leak Redis details. */
export interface PresenceNotifier {
  notifyOnline(event: UserOnlineEvent): void | Promise<void>;
  notifyOffline(event: UserOfflineEvent): void | Promise<void>;
}

export interface PresenceOptions {
  readonly ttlSeconds: number;
  readonly heartbeatIntervalMs: number;
  readonly instanceId: string;
}

export interface UserPresenceSnapshot {
  readonly userId: string;
  readonly status: 'online';
  readonly lastSeenAt: Date;
  readonly instanceId: string;
  readonly socketIds: readonly string[];
}

export interface ConnectionChangeResult {
  readonly connectionCount: number;
  readonly lastSeenAt: Date;
}

/**
 * Persistence for ephemeral presence. Callers work with user and socket
 * identifiers only — never Redis keys, TTLs as Redis options, or ioredis types.
 */
export interface PresenceStore {
  addConnection(
    userId: string,
    socketId: string,
    lastSeenAt: Date,
    ttlSeconds: number,
    instanceId: string,
  ): Promise<ConnectionChangeResult>;

  removeConnection(
    userId: string,
    socketId: string,
    ttlSeconds: number,
  ): Promise<ConnectionChangeResult>;

  refreshConnection(
    userId: string,
    socketId: string,
    lastSeenAt: Date,
    ttlSeconds: number,
    instanceId: string,
  ): Promise<boolean>;

  getPresence(userId: string): Promise<UserPresenceSnapshot | null>;

  clearUser(userId: string): Promise<void>;
}
