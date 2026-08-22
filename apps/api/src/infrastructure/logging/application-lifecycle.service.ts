import {
  Injectable,
  type BeforeApplicationShutdown,
  type OnApplicationShutdown,
} from '@nestjs/common';

import { StructuredLoggerService } from './structured-logger.service.js';

/** Emits structured shutdown events when Nest receives SIGTERM/SIGINT or `app.close()`. */
@Injectable()
export class ApplicationLifecycleService
  implements BeforeApplicationShutdown, OnApplicationShutdown
{
  constructor(private readonly logger: StructuredLoggerService) {}

  beforeApplicationShutdown(signal?: string): void {
    this.logger.log('application.shutting_down', signal === undefined ? {} : { signal });
  }

  onApplicationShutdown(signal?: string): void {
    this.logger.log('application.stopped', signal === undefined ? {} : { signal });
  }
}
