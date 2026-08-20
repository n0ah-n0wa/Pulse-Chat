import { Test } from '@nestjs/testing';
import { ConfigValidationError, createTestConfig } from '@pulse-chat/shared';
import { afterEach, describe, expect, it } from 'vitest';

import { AppConfigModule } from './app-config.module.js';
import { AppConfigService } from './app-config.service.js';

const BASE_ENV = {
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://localhost:27017/pulse_chat_test',
  REDIS_URL: 'redis://localhost:6379/1',
  CORS_ORIGIN: 'http://localhost:5173',
} as const;

function applyEnv(values: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe('AppConfigModule', () => {
  const previousEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...previousEnv };
  });

  it('loads typed configuration at module startup', async () => {
    applyEnv(BASE_ENV);

    const moduleRef = await Test.createTestingModule({ imports: [AppConfigModule] }).compile();
    const config = moduleRef.get(AppConfigService);

    expect(config.nodeEnv).toBe('test');
    expect(config.port).toBe(3000);
    expect(config.jwt.accessExpiresIn).toBe('15m');

    await moduleRef.close();
  });

  it('fails fast when required variables are missing in production', async () => {
    applyEnv({
      NODE_ENV: 'production',
      MONGODB_URI: BASE_ENV.MONGODB_URI,
      REDIS_URL: BASE_ENV.REDIS_URL,
      CORS_ORIGIN: 'https://chat.example.com',
      JWT_ACCESS_SECRET: undefined,
      JWT_REFRESH_SECRET: undefined,
    });

    await expect(
      Test.createTestingModule({ imports: [AppConfigModule] }).compile(),
    ).rejects.toBeInstanceOf(ConfigValidationError);
  });

  it('matches the shared test helper defaults', async () => {
    applyEnv(BASE_ENV);

    const moduleRef = await Test.createTestingModule({ imports: [AppConfigModule] }).compile();
    const config = moduleRef.get(AppConfigService);
    const expected = createTestConfig();

    expect(config.values).toEqual(expected);

    await moduleRef.close();
  });
});
