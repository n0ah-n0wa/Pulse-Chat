import { describe, expect, it } from 'vitest';

import { socketPayloadCorrelation } from './socket-payload-correlation.js';

describe('socketPayloadCorrelation', () => {
  it('copies roomId and messageId and ignores message content', () => {
    expect(
      socketPayloadCorrelation({
        roomId: 'room-1',
        messageId: 'msg-1',
        content: 'secret chat text',
      }),
    ).toEqual({ roomId: 'room-1', messageId: 'msg-1' });
  });

  it('returns nothing for non-objects', () => {
    expect(socketPayloadCorrelation('hello')).toEqual({});
    expect(socketPayloadCorrelation(null)).toEqual({});
  });
});
