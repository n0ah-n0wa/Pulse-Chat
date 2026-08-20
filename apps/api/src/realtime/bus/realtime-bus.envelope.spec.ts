import { describe, expect, it } from 'vitest';

import { DISTRIBUTED_REALTIME_EVENTS } from './realtime-bus.channels.js';
import {
  deserializeRealtimeBusEnvelope,
  serializeRealtimeBusEnvelope,
} from './realtime-bus.envelope.js';

describe('realtime bus envelope serialization', () => {
  it('round-trips a versioned event envelope', () => {
    const raw = serializeRealtimeBusEnvelope(
      {
        event: DISTRIBUTED_REALTIME_EVENTS.MESSAGE_NEW,
        roomId: '507f1f77bcf86cd799439021',
        payload: { message: { id: '1' } },
      },
      'instance-a',
      new Date('2026-08-18T12:00:00.000Z'),
    );

    expect(deserializeRealtimeBusEnvelope(raw)).toEqual({
      version: 1,
      event: DISTRIBUTED_REALTIME_EVENTS.MESSAGE_NEW,
      originInstanceId: 'instance-a',
      occurredAt: '2026-08-18T12:00:00.000Z',
      roomId: '507f1f77bcf86cd799439021',
      payload: { message: { id: '1' } },
    });
  });

  it('rejects malformed payloads instead of throwing', () => {
    expect(deserializeRealtimeBusEnvelope('not-json')).toBeNull();
    expect(deserializeRealtimeBusEnvelope('{}')).toBeNull();
    expect(
      deserializeRealtimeBusEnvelope(JSON.stringify({ version: 2, event: 'message:new' })),
    ).toBeNull();
    expect(
      deserializeRealtimeBusEnvelope(
        JSON.stringify({
          version: 1,
          event: 'unknown:event',
          originInstanceId: 'a',
          occurredAt: '2026-08-18T12:00:00.000Z',
          payload: {},
        }),
      ),
    ).toBeNull();
  });
});
