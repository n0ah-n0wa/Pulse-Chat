import { Injectable } from '@nestjs/common';

interface ConnectionRecord {
  readonly socketId: string;
  readonly userId: string;
}

@Injectable()
export class RealtimeConnectionStateService {
  private readonly connections = new Map<string, ConnectionRecord>();
  private readonly roomSubscriptionsBySocket = new Map<string, Set<string>>();

  registerConnection(socketId: string, userId: string): void {
    this.connections.set(socketId, { socketId, userId });
  }

  removeConnection(socketId: string): void {
    this.connections.delete(socketId);
    this.roomSubscriptionsBySocket.delete(socketId);
  }

  addRoomSubscription(socketId: string, roomId: string): void {
    const subscriptions = this.roomSubscriptionsBySocket.get(socketId) ?? new Set<string>();
    subscriptions.add(roomId);
    this.roomSubscriptionsBySocket.set(socketId, subscriptions);
  }

  removeRoomSubscription(socketId: string, roomId: string): void {
    this.roomSubscriptionsBySocket.get(socketId)?.delete(roomId);
  }

  /** Drops a room from every tracked socket belonging to `userId`. */
  removeRoomSubscriptionsForUser(userId: string, roomId: string): void {
    for (const [socketId, record] of this.connections) {
      if (record.userId === userId) {
        this.roomSubscriptionsBySocket.get(socketId)?.delete(roomId);
      }
    }
  }

  getRoomSubscriptions(socketId: string): readonly string[] {
    return [...(this.roomSubscriptionsBySocket.get(socketId) ?? [])];
  }

  countConnectionsForUser(userId: string): number {
    return [...this.connections.values()].filter((connection) => connection.userId === userId)
      .length;
  }

  hasConnection(socketId: string): boolean {
    return this.connections.has(socketId);
  }

  /**
   * Drops tracked sockets that are no longer live on this process.
   * Returns the removed records so callers can clear presence without
   * touching sockets that belong to another instance.
   */
  removeStaleConnections(isLive: (socketId: string) => boolean): readonly ConnectionRecord[] {
    const stale: ConnectionRecord[] = [];

    for (const [socketId, record] of this.connections) {
      if (isLive(socketId)) {
        continue;
      }

      stale.push(record);
      this.connections.delete(socketId);
      this.roomSubscriptionsBySocket.delete(socketId);
    }

    return stale;
  }
}
