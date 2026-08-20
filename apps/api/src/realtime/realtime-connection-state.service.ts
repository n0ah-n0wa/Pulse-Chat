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
    const subscriptions =
      this.roomSubscriptionsBySocket.get(socketId) ?? new Set<string>();
    subscriptions.add(roomId);
    this.roomSubscriptionsBySocket.set(socketId, subscriptions);
  }

  removeRoomSubscription(socketId: string, roomId: string): void {
    this.roomSubscriptionsBySocket.get(socketId)?.delete(roomId);
  }

  getRoomSubscriptions(socketId: string): readonly string[] {
    return [...(this.roomSubscriptionsBySocket.get(socketId) ?? [])];
  }

  countConnectionsForUser(userId: string): number {
    return [...this.connections.values()].filter((connection) => connection.userId === userId).length;
  }

  hasConnection(socketId: string): boolean {
    return this.connections.has(socketId);
  }
}
