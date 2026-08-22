import { describe, expect, it, vi } from 'vitest';
import type { Connection } from 'mongoose';

import type { StructuredLoggerService } from '../logging/structured-logger.service.js';
import { MongooseConnectionLifecycle } from './mongoose-connection-lifecycle.js';

describe('MongooseConnectionLifecycle', () => {
  it('logs connection errors without requiring a URI on the call', () => {
    const handlers: Record<string, (error?: Error) => void> = {};
    const connection = {
      readyState: 0,
      on: vi.fn((event: string, handler: (error?: Error) => void) => {
        handlers[event] = handler;
        return connection;
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } satisfies Pick<StructuredLoggerService, 'log' | 'warn' | 'error'>;

    const lifecycle = new MongooseConnectionLifecycle(
      connection as unknown as Connection,
      logger as unknown as StructuredLoggerService,
    );

    lifecycle.onModuleInit();

    const error = new Error('failed to connect to mongodb://user:secret@localhost/db');
    handlers['error']?.(error);

    expect(logger.error).toHaveBeenCalledWith('mongodb.error', { error });
    expect(logger.log).not.toHaveBeenCalledWith(
      expect.stringContaining('mongodb://'),
      expect.anything(),
    );
  });
});
