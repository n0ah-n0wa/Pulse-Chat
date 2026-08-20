import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { APP_NAME } from '@pulse-chat/shared';

import { AppModule } from '../app.module.js';
import { AppConfigService } from '../config/index.js';
import { NestStructuredLoggerService } from '../infrastructure/logging/nest-structured-logger.service.js';
import { StructuredLoggerService } from '../infrastructure/logging/structured-logger.service.js';
import { configureApplication } from './configure-application.js';

export async function createApplication(): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(NestStructuredLoggerService));
  app.flushLogs();

  const config = app.get(AppConfigService);
  configureApplication(app, config);

  const structuredLogger = app.get(StructuredLoggerService);
  structuredLogger.log('application.configured', {
    nodeEnv: config.nodeEnv,
    port: config.port,
  });

  return app;
}

export async function bootstrapApplication(): Promise<void> {
  const app = await createApplication();
  const config = app.get(AppConfigService);
  const logger = app.get(NestStructuredLoggerService);

  await app.listen(config.port);

  logger.log(
    `${APP_NAME} API is listening on port ${String(config.port)} (${config.nodeEnv})`,
    'Bootstrap',
  );
}
