import type { PublishRealtimeEventInput } from './realtime-bus.envelope.js';

/** Transport-neutral publisher for cross-instance realtime events. */
export interface RealtimeEventPublisher {
  publish(event: PublishRealtimeEventInput): Promise<void>;
}
