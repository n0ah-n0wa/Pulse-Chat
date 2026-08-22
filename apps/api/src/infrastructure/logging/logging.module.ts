import { Global, Module } from '@nestjs/common';

import { ApplicationLifecycleService } from './application-lifecycle.service.js';
import { HttpRequestLoggingMiddleware } from './http-request-logging.middleware.js';
import { NestStructuredLoggerService } from './nest-structured-logger.service.js';
import { RequestContextService } from './request-context.service.js';
import { RequestIdMiddleware } from './request-id.middleware.js';
import { StructuredLoggerService } from './structured-logger.service.js';

@Global()
@Module({
  providers: [
    RequestContextService,
    StructuredLoggerService,
    NestStructuredLoggerService,
    RequestIdMiddleware,
    HttpRequestLoggingMiddleware,
    ApplicationLifecycleService,
  ],
  exports: [
    RequestContextService,
    StructuredLoggerService,
    NestStructuredLoggerService,
    RequestIdMiddleware,
    HttpRequestLoggingMiddleware,
  ],
})
export class LoggingModule {}
