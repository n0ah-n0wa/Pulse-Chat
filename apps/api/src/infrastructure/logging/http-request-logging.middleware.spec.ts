import { EventEmitter } from 'node:events';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

import type { RequestContextService } from './request-context.service.js';
import type { StructuredLoggerService } from './structured-logger.service.js';
import { HttpRequestLoggingMiddleware } from './http-request-logging.middleware.js';

function createResponse(): Response & EventEmitter {
  return new EventEmitter() as Response & EventEmitter;
}

describe('HttpRequestLoggingMiddleware', () => {
  const logger = {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } satisfies Pick<StructuredLoggerService, 'log' | 'warn' | 'error'>;

  const requestContext = {
    getRequestId: vi.fn().mockReturnValue('req-42'),
  } satisfies Pick<RequestContextService, 'getRequestId'>;

  const middleware = new HttpRequestLoggingMiddleware(
    logger as unknown as StructuredLoggerService,
    requestContext as unknown as RequestContextService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    requestContext.getRequestId.mockReturnValue('req-42');
  });

  it('logs method, path, status, duration, and requestId after the response finishes', () => {
    const req = {
      method: 'GET',
      path: '/api/rooms',
      originalUrl: '/api/rooms?limit=20',
      url: '/api/rooms?limit=20',
      user: { userId: 'user-1' },
    } as unknown as Request;
    const res = createResponse();
    res.statusCode = 200;
    const next = vi.fn() as NextFunction;

    middleware.use(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(logger.log).not.toHaveBeenCalled();

    res.emit('finish');

    expect(logger.log).toHaveBeenCalledTimes(1);
    const logged: unknown = logger.log.mock.calls[0]?.[1];
    expect(logged).toMatchObject({
      method: 'GET',
      path: '/api/rooms',
      statusCode: 200,
      requestId: 'req-42',
      userId: 'user-1',
    });
    expect(
      typeof logged === 'object' &&
        logged !== null &&
        'duration' in logged &&
        typeof logged.duration === 'number',
    ).toBe(true);
    const serialized = JSON.stringify(logged);
    expect(serialized).not.toContain('limit=20');
    expect(serialized).not.toContain('authorization');
    expect(serialized).not.toContain('"body"');
  });

  it('does not log health probes', () => {
    const req = {
      method: 'GET',
      path: '/health/readiness',
      originalUrl: '/health/readiness',
    } as unknown as Request;
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    middleware.use(req, res, next);
    res.emit('finish');

    expect(logger.log).not.toHaveBeenCalled();
  });

  it('skips health probes using originalUrl when req.path is empty', () => {
    const req = {
      method: 'GET',
      path: '',
      originalUrl: '/health/readiness',
      url: '/health/readiness',
    } as unknown as Request;
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    middleware.use(req, res, next);
    res.emit('finish');

    expect(logger.log).not.toHaveBeenCalled();
  });

  it('logs a request only once when the middleware runs twice', () => {
    const req = {
      method: 'GET',
      path: '/api/rooms',
      originalUrl: '/api/rooms',
      url: '/api/rooms',
    } as unknown as Request;
    const res = createResponse();
    res.statusCode = 200;
    const next = vi.fn() as NextFunction;

    middleware.use(req, res, next);
    middleware.use(req, res, next);
    res.emit('finish');

    expect(next).toHaveBeenCalledTimes(2);
    expect(logger.log).toHaveBeenCalledTimes(1);
  });
});
