import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { ApiExceptionFilter } from './api-exception.filter.js';

/** Global HTTP cross-cutting providers (exception handling, etc.). */
@Module({
  providers: [
    ApiExceptionFilter,
    {
      provide: APP_FILTER,
      useExisting: ApiExceptionFilter,
    },
  ],
})
export class HttpModule {}
