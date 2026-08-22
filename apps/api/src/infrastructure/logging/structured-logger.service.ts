import { Injectable, type LogLevel } from '@nestjs/common';

import { AppConfigService } from '../../config/index.js';
import { RequestContextService } from './request-context.service.js';
import { sanitizeLogReplacer } from './sanitize-log-fields.js';

export type StructuredLogFields = Record<string, unknown>;

/**
 * Structured logging wrapper. Production logs are JSON objects; development
 * logs stay readable but serialize the same fields (and the same redaction)
 * after the event name.
 *
 * Lines are written to process stdout/stderr. They must not go through Nest's
 * `Logger` after `app.useLogger(NestStructuredLoggerService)`: that bridge
 * calls back into this service, and a re-entrancy guard would drop the line.
 *
 * Request-scoped fields (`requestId`, `userId`, `roomId`, `messageId`) are
 * merged from {@link RequestContextService} when present. Callers may still
 * pass them explicitly; explicit fields win.
 */
@Injectable()
export class StructuredLoggerService {
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
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      event,
      ...this.contextFields(),
      ...fields,
    };

    if (this.config.nodeEnv === 'production') {
      const line = serializeLogFields(payload) ?? '{}';
      writeLogLine(level, `${line}\n`);
      return;
    }

    const { level: _level, event: _event, ...rest } = payload;
    const serializedFields = serializeLogFields(rest);
    const message = `${event}${serializedFields === undefined ? '' : ` ${serializedFields}`}`;
    writeLogLine(level, `${message}\n`);
  }

  private contextFields(): StructuredLogFields {
    const store = this.requestContext.snapshot();
    if (store === undefined) {
      return {};
    }

    return {
      requestId: store.requestId,
      ...(store.userId === undefined ? {} : { userId: store.userId }),
      ...(store.roomId === undefined ? {} : { roomId: store.roomId }),
      ...(store.messageId === undefined ? {} : { messageId: store.messageId }),
    };
  }
}

const LOG_FIELDS_MAX_LENGTH = 4_000;

function writeLogLine(level: LogLevel, line: string): void {
  const stream = level === 'error' ? process.stderr : process.stdout;
  stream.write(line);
}

function serializeLogFields(value: unknown): string | undefined {
  try {
    const serialized = JSON.stringify(value, sanitizeLogReplacer);
    if (serialized === undefined) {
      return undefined;
    }

    if (serialized.length > LOG_FIELDS_MAX_LENGTH) {
      return `${serialized.slice(0, LOG_FIELDS_MAX_LENGTH)}…`;
    }

    return serialized;
  } catch {
    return '{"error":"unserializable log fields"}';
  }
}
