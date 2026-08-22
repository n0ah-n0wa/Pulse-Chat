import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { RequestContextService } from './request-context.service.js';
import { StructuredLoggerService } from './structured-logger.service.js';

interface RequestWithOptionalUser extends Request {
  user?: { readonly userId: string };
}

type ResponseWithLogFlag = Response & {
  [HTTP_REQUEST_LOG_ATTACHED]?: true;
};

/** Nest can apply `forRoutes('*')` more than once; one finish listener is enough. */
const HTTP_REQUEST_LOG_ATTACHED = Symbol.for('pulse.httpRequestLogAttached');

/**
 * Writes one `http.request` access log after the response is sent.
 *
 * Health probes are omitted so orchestrator traffic does not drown out
 * application events. Request bodies and headers are never logged.
 */
@Injectable()
export class HttpRequestLoggingMiddleware implements NestMiddleware {
  constructor(
    private readonly logger: StructuredLoggerService,
    private readonly requestContext: RequestContextService,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const path = requestPathWithoutQuery(req);
    if (isHealthProbe(path)) {
      next();
      return;
    }

    const response = res as ResponseWithLogFlag;
    if (response[HTTP_REQUEST_LOG_ATTACHED] === true) {
      next();
      return;
    }
    response[HTTP_REQUEST_LOG_ATTACHED] = true;

    const started = performance.now();
    const requestId = this.requestContext.getRequestId();
    const method = req.method;

    res.on('finish', () => {
      const userId = (req as RequestWithOptionalUser).user?.userId;
      this.logger.log('http.request', {
        method,
        path,
        statusCode: res.statusCode,
        duration: Math.round(performance.now() - started),
        ...(requestId === undefined ? {} : { requestId }),
        ...(userId === undefined ? {} : { userId }),
      });
    });

    next();
  }
}

function isHealthProbe(path: string): boolean {
  return path === '/health' || path.startsWith('/health/');
}

function requestPathWithoutQuery(req: Request): string {
  const url = req.originalUrl || req.url || req.path;
  const queryIndex = url.indexOf('?');
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}
