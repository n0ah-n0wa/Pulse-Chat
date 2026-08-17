import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { APP_NAME } from '@pulse-chat/shared';

import { AppModule } from './app.module';

const DEFAULT_PORT = 3000;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env['PORT'] ?? DEFAULT_PORT);

  await app.listen(port);

  new Logger('Bootstrap').log(`${APP_NAME} API is listening on port ${String(port)}`);
}

void bootstrap();
