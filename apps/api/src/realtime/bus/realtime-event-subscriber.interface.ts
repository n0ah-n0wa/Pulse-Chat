import type { RealtimeBusEnvelope } from './realtime-bus.envelope.js';

export type RealtimeEventHandler = (event: RealtimeBusEnvelope) => void;

/** Transport-neutral subscriber for cross-instance realtime events. */
export interface RealtimeEventSubscriber {
  onEvent(handler: RealtimeEventHandler): void;
}
