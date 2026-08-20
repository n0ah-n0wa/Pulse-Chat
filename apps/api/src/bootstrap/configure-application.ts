import { RequestMethod, type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

import { APP_NAME } from '@pulse-chat/shared';

import { REQUEST_BODY_LIMIT } from '../common/constants/http.constants.js';
import type { AppConfigService } from '../config/index.js';

const HEALTH_PATHS = [
  { path: 'health', method: RequestMethod.ALL },
  { path: 'health/readiness', method: RequestMethod.ALL },
  { path: 'health/liveness', method: RequestMethod.ALL },
] as const;

/**
 * Applies cross-cutting HTTP configuration shared by production and tests.
 */
export function configureApplication(app: INestApplication, config: AppConfigService): void {
  const expressApp = app as NestExpressApplication;

  expressApp.useBodyParser('json', { limit: REQUEST_BODY_LIMIT });
  expressApp.useBodyParser('urlencoded', { extended: true, limit: REQUEST_BODY_LIMIT });

  // Trust the single reverse-proxy hop (nginx). Combined with nginx overwriting
  // X-Forwarded-For, this yields the real client IP for auth rate limiting.
  expressApp.set('trust proxy', 1);

  expressApp.use(
    helmet({
      // Swagger UI relies on inline scripts/styles in non-production environments.
      contentSecurityPolicy: config.nodeEnv === 'production' ? undefined : false,
    }),
  );

  expressApp.enableCors({
    origin: config.corsOrigin,
    credentials: true,
  });

  expressApp.setGlobalPrefix('api', {
    exclude: [...HEALTH_PATHS],
  });

  if (config.nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle(APP_NAME)
      .setDescription('Pulse Chat REST API')
      .setVersion('0.0.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(expressApp, swaggerConfig);
    SwaggerModule.setup('docs', expressApp, document, {
      useGlobalPrefix: true,
    });
  }

  expressApp.enableShutdownHooks();
}
