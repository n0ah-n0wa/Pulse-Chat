import { describe, expect, it, vi } from 'vitest';

import type { StructuredLoggerService } from './structured-logger.service.js';
import { ApplicationLifecycleService } from './application-lifecycle.service.js';

describe('ApplicationLifecycleService', () => {
  it('logs structured shutdown events with the signal', () => {
    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } satisfies Pick<StructuredLoggerService, 'log' | 'warn' | 'error'>;

    const lifecycle = new ApplicationLifecycleService(logger as unknown as StructuredLoggerService);

    lifecycle.beforeApplicationShutdown('SIGTERM');
    lifecycle.onApplicationShutdown('SIGTERM');

    expect(logger.log).toHaveBeenCalledWith('application.shutting_down', { signal: 'SIGTERM' });
    expect(logger.log).toHaveBeenCalledWith('application.stopped', { signal: 'SIGTERM' });
  });
});
