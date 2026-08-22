import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

import { RequestContextService } from './request-context.service.js';
import { RequestIdMiddleware } from './request-id.middleware.js';

describe('RequestIdMiddleware', () => {
  it('propagates an incoming correlation id into request context and the response', () => {
    const requestContext = new RequestContextService();
    const middleware = new RequestIdMiddleware(requestContext);
    const setHeader = vi.fn();
    const req = { headers: { 'x-request-id': 'corr-1' } } as unknown as Request;
    const res = { setHeader } as unknown as Response;

    middleware.use(req, res, (() => {
      expect(requestContext.getRequestId()).toBe('corr-1');
    }) as NextFunction);

    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'corr-1');
  });
});
