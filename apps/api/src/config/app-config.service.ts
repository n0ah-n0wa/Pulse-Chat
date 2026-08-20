import { Inject, Injectable } from '@nestjs/common';

import type { AppConfig } from '@pulse-chat/shared';

import { APP_CONFIG } from './app-config.constants.js';

/**
 * Typed access to validated environment configuration.
 *
 * Application code must depend on this service instead of reading
 * {@link process.env} directly.
 */
@Injectable()
export class AppConfigService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  get nodeEnv(): AppConfig['nodeEnv'] {
    return this.config.nodeEnv;
  }

  get port(): number {
    return this.config.port;
  }

  get mongodbUri(): string {
    return this.config.mongodbUri;
  }

  get redisUrl(): string {
    return this.config.redisUrl;
  }

  get corsOrigin(): string {
    return this.config.corsOrigin;
  }

  get jwt(): AppConfig['jwt'] {
    return this.config.jwt;
  }

  get fileStorage(): AppConfig['fileStorage'] {
    return this.config.fileStorage;
  }

  get rateLimit(): AppConfig['rateLimit'] {
    return this.config.rateLimit;
  }

  /** Returns the underlying immutable configuration object. */
  get values(): Readonly<AppConfig> {
    return this.config;
  }
}
