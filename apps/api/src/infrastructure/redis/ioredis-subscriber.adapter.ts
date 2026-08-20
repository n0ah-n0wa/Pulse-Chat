import type { Redis } from 'ioredis';

import type { RedisSubscriber } from './redis-subscriber.interface.js';

/**
 * Adapts an ioredis (or ioredis-mock) client used exclusively as a subscriber.
 */
export class IoredisSubscriberAdapter implements RedisSubscriber {
  private reconnectListener: (() => void) | undefined;
  private hasBecomeReady = false;

  constructor(private readonly client: Redis) {
    this.client.on('ready', () => {
      if (!this.hasBecomeReady) {
        this.hasBecomeReady = true;
        return;
      }

      this.reconnectListener?.();
    });
  }

  async subscribe(channels: readonly string[]): Promise<void> {
    await this.ensureConnected();
    if (channels.length === 0) {
      return;
    }

    await this.client.subscribe(...channels);
  }

  async unsubscribe(): Promise<void> {
    await this.client.unsubscribe();
  }

  onMessage(listener: (channel: string, message: string) => void): void {
    this.client.on('message', listener);
  }

  onReconnect(listener: () => void): void {
    this.reconnectListener = listener;
  }

  disconnect(): void {
    this.client.disconnect();
  }

  async connect(): Promise<void> {
    await this.ensureConnected();
  }

  async quit(): Promise<void> {
    if (this.client.status === 'end') {
      return;
    }

    await this.client.quit();
  }

  private async ensureConnected(): Promise<void> {
    const { status } = this.client;
    if (status === 'ready' || status === 'connect' || status === 'connecting') {
      return;
    }

    try {
      await this.client.connect();
    } catch (error) {
      if (error instanceof Error && /already connecting\/connected/i.test(error.message)) {
        return;
      }

      throw error;
    }
  }
}
