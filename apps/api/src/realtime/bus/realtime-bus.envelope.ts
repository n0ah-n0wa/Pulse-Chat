import { z } from 'zod';

import {
  DISTRIBUTED_REALTIME_EVENTS,
  type DistributedRealtimeEvent,
} from './realtime-bus.channels.js';

const distributedEventSchema = z.enum([
  DISTRIBUTED_REALTIME_EVENTS.MESSAGE_NEW,
  DISTRIBUTED_REALTIME_EVENTS.MESSAGE_UPDATED,
  DISTRIBUTED_REALTIME_EVENTS.MESSAGE_DELETED,
  DISTRIBUTED_REALTIME_EVENTS.REACTION_ADDED,
  DISTRIBUTED_REALTIME_EVENTS.REACTION_REMOVED,
  DISTRIBUTED_REALTIME_EVENTS.USER_ONLINE,
  DISTRIBUTED_REALTIME_EVENTS.USER_OFFLINE,
  DISTRIBUTED_REALTIME_EVENTS.NOTIFICATION_NEW,
]);

export const realtimeBusEnvelopeSchema = z
  .object({
    version: z.literal(1),
    event: distributedEventSchema,
    originInstanceId: z.string().trim().min(1),
    occurredAt: z.string().trim().min(1),
    roomId: z.string().trim().min(1).optional(),
    userId: z.string().trim().min(1).optional(),
    payload: z.unknown(),
  })
  .strict();

export type RealtimeBusEnvelope = z.infer<typeof realtimeBusEnvelopeSchema>;

export interface PublishRealtimeEventInput {
  readonly event: DistributedRealtimeEvent;
  readonly payload: unknown;
  readonly roomId?: string;
  readonly userId?: string;
}

export function serializeRealtimeBusEnvelope(
  input: PublishRealtimeEventInput,
  originInstanceId: string,
  occurredAt = new Date(),
): string {
  const envelope: RealtimeBusEnvelope = {
    version: 1,
    event: input.event,
    originInstanceId,
    occurredAt: occurredAt.toISOString(),
    payload: input.payload,
    ...(input.roomId !== undefined ? { roomId: input.roomId } : {}),
    ...(input.userId !== undefined ? { userId: input.userId } : {}),
  };

  return JSON.stringify(envelope);
}

export function deserializeRealtimeBusEnvelope(raw: string): RealtimeBusEnvelope | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = realtimeBusEnvelopeSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
