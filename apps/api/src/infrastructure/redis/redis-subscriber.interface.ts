/**
 * Dedicated Redis subscriber connection. Redis forbids using the same
 * connection for Pub/Sub subscribe and ordinary commands.
 */
export interface RedisSubscriber {
  subscribe(channels: readonly string[]): Promise<void>;
  unsubscribe(): Promise<void>;
  onMessage(listener: (channel: string, message: string) => void): void;
  onReconnect(listener: () => void): void;
  disconnect(): void;
  connect(): Promise<void>;
  quit(): Promise<void>;
}
