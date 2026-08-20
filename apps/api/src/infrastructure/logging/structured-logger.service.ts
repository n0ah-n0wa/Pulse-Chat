import { Injectable, Logger, type LogLevel } from '@nestjs/common';

import { AppConfigService } from '../../config/index.js';
import { RequestContextService } from './request-context.service.js';

export type StructuredLogFields = Record<string, unknown>;

/**
 * Structured logging wrapper. Production logs are JSON objects; development
 * logs use Nest's default formatting for readability.
 */
@Injectable()
export class StructuredLoggerService {
  private readonly nestLogger = new Logger('PulseChat');

  constructor(
    private readonly config: AppConfigService,
    private readonly requestContext: RequestContextService,
  ) {}

  log(event: string, fields: StructuredLogFields = {}): void {
    this.write('log', event, fields);
  }

  warn(event: string, fields: StructuredLogFields = {}): void {
    this.write('warn', event, fields);
  }

  error(event: string, fields: StructuredLogFields = {}, trace?: string): void {
    this.write('error', event, { ...fields, trace });
  }

  private write(level: LogLevel, event: string, fields: StructuredLogFields): void {
    const requestId = this.requestContext.getRequestId();
    const payload = {
      level,
      event,
      ...(requestId ? { requestId } : {}),
      ...fields,
      timestamp: new Date().toISOString(),
    };

    if (this.config.nodeEnv === 'production') {
      const line = JSON.stringify(payload);
      switch (level) {
        case 'error':
          this.nestLogger.error(line);
          break;
        case 'warn':
          this.nestLogger.warn(line);
          break;
        default:
          this.nestLogger.log(line);
      }
      return;
    }

    const message = `${event}${Object.keys(fields).length > 0 ? ` ${JSON.stringify(fields)}` : ''}`;
    const trace = fields['trace'];
    switch (level) {
      case 'error':
        this.nestLogger.error(message, typeof trace === 'string' ? trace : undefined);
        break;
      case 'warn':
        this.nestLogger.warn(message);
        break;
      default:
        this.nestLogger.log(message);
    }
  }
}
