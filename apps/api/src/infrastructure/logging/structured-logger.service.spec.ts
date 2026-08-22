import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AppConfigService } from '../../config/index.js';
import { RequestContextService } from './request-context.service.js';
import { StructuredLoggerService } from './structured-logger.service.js';

describe('StructuredLoggerService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes production JSON to stdout with timestamp, level, event, and request context', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const requestContext = new RequestContextService();
    const logger = new StructuredLoggerService(
      { nodeEnv: 'production' } as AppConfigService,
      requestContext,
    );

    requestContext.run(
      { requestId: 'req-9', userId: 'user-9', roomId: 'room-9', messageId: 'msg-9' },
      () => {
        logger.log('http.request', { duration: 12 });
      },
    );

    const rawLine: unknown = stdout.mock.calls[0]?.[0];
    expect(typeof rawLine).toBe('string');
    const payload = JSON.parse(String(rawLine).trim()) as Record<string, unknown>;
    expect(payload).toMatchObject({
      level: 'log',
      event: 'http.request',
      requestId: 'req-9',
      userId: 'user-9',
      roomId: 'room-9',
      messageId: 'msg-9',
      duration: 12,
    });
    expect(payload['timestamp']).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
  });

  it('redacts secrets before writing the line', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const logger = new StructuredLoggerService(
      { nodeEnv: 'production' } as AppConfigService,
      new RequestContextService(),
    );

    logger.warn('auth.failure', {
      password: 'hunter2',
      refreshToken: 'opaque',
      authorization: 'Bearer abc.def.ghi',
    });

    const rawWarn: unknown = stdout.mock.calls[0]?.[0];
    expect(typeof rawWarn).toBe('string');
    const payload = JSON.parse(String(rawWarn).trim()) as Record<string, unknown>;
    expect(payload['password']).toBe('[REDACTED]');
    expect(payload['refreshToken']).toBe('[REDACTED]');
    expect(payload['authorization']).toBe('[REDACTED]');
    expect(JSON.stringify(payload)).not.toContain('hunter2');
    expect(JSON.stringify(payload)).not.toContain('opaque');
  });

  it('writes errors to stderr in production', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const logger = new StructuredLoggerService(
      { nodeEnv: 'production' } as AppConfigService,
      new RequestContextService(),
    );

    logger.error('redis.error', { reason: 'timeout' });

    const rawLine: unknown = stderr.mock.calls[0]?.[0];
    expect(typeof rawLine).toBe('string');
    expect(JSON.parse(String(rawLine).trim())).toMatchObject({
      level: 'error',
      event: 'redis.error',
      reason: 'timeout',
    });
  });
});
