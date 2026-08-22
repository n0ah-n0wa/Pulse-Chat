import { describe, expect, it } from 'vitest';

import { RequestContextService } from './request-context.service.js';

describe('RequestContextService', () => {
  const context = new RequestContextService();

  it('exposes requestId during run and clears it afterwards', () => {
    expect(context.getRequestId()).toBeUndefined();

    context.run({ requestId: 'req-1' }, () => {
      expect(context.getRequestId()).toBe('req-1');
    });

    expect(context.getRequestId()).toBeUndefined();
  });

  it('assigns userId onto the active store', () => {
    context.run({ requestId: 'req-2' }, () => {
      context.assign({ userId: 'user-1', roomId: 'room-1' });
      expect(context.snapshot()).toEqual({
        requestId: 'req-2',
        userId: 'user-1',
        roomId: 'room-1',
      });
      expect(context.getUserId()).toBe('user-1');
    });
  });
});
