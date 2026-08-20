import { Global, Module } from '@nestjs/common';

import { RequestContextService } from './request-context.service.js';
import { NestStructuredLoggerService } from './nest-structured-logger.service.js';
import { StructuredLoggerService } from './structured-logger.service.js';

@Global()
@Module({
  providers: [RequestContextService, StructuredLoggerService, NestStructuredLoggerService],
  exports: [RequestContextService, StructuredLoggerService, NestStructuredLoggerService],
})
export class LoggingModule {}
