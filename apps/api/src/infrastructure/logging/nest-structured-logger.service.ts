import { Injectable, type LoggerService } from '@nestjs/common';

import { StructuredLoggerService } from './structured-logger.service.js';

/**
 * Bridges Nest's {@link LoggerService} to {@link StructuredLoggerService} so
 * framework logs include request correlation where available.
 */
@Injectable()
export class NestStructuredLoggerService implements LoggerService {
  constructor(private readonly structuredLogger: StructuredLoggerService) {}

  log(message: unknown, context?: string): void {
    this.structuredLogger.log('nest.log', {
      message: String(message),
      ...(context ? { context } : {}),
    });
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.structuredLogger.error(
      'nest.error',
      {
        message: String(message),
        ...(context ? { context } : {}),
      },
      trace,
    );
  }

  warn(message: unknown, context?: string): void {
    this.structuredLogger.warn('nest.warn', {
      message: String(message),
      ...(context ? { context } : {}),
    });
  }

  debug?(message: unknown, context?: string): void {
    this.structuredLogger.log('nest.debug', {
      message: String(message),
      ...(context ? { context } : {}),
    });
  }

  verbose?(message: unknown, context?: string): void {
    this.structuredLogger.log('nest.verbose', {
      message: String(message),
      ...(context ? { context } : {}),
    });
  }
}
