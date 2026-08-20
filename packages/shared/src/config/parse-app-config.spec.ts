import { describe, expect, it } from 'vitest';

import { ConfigValidationError } from './config-validation.error.js';
import {
  createDevelopmentConfig,
  createTestConfig,
  DEV_INSECURE_JWT_ACCESS_SECRET,
  DEV_INSECURE_JWT_REFRESH_SECRET,
  parseAppConfig,
} from './parse-app-config.js';

const validProductionEnv = {
  NODE_ENV: 'production',
  PORT: '3000',
  MONGODB_URI: 'mongodb://mongodb:27017/pulse_chat',
  REDIS_URL: 'redis://redis:6379',
  JWT_ACCESS_SECRET: 'production-access-secret-at-least-32-characters-long',
  JWT_REFRESH_SECRET: 'production-refresh-secret-at-least-32-characters-long',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '30d',
  CORS_ORIGIN: 'https://chat.example.com',
  FILE_STORAGE_PROVIDER: 'local',
  FILE_STORAGE_PATH: './storage',
  RATE_LIMIT_MESSAGES: '20',
} as const;

describe('parseAppConfig', () => {
  it('parses a complete production configuration', () => {
    const config = parseAppConfig(validProductionEnv);

    expect(config.nodeEnv).toBe('production');
    expect(config.port).toBe(3000);
    expect(config.mongodbUri).toBe(validProductionEnv.MONGODB_URI);
    expect(config.redisUrl).toBe(validProductionEnv.REDIS_URL);
    expect(config.corsOrigin).toBe(validProductionEnv.CORS_ORIGIN);
    expect(config.jwt.accessSecret).toBe(validProductionEnv.JWT_ACCESS_SECRET);
    expect(config.fileStorage.provider).toBe('local');
    expect(config.fileStorage.path).toBe('./storage');
    expect(config.rateLimit.messages).toBe(20);
    expect(config.rateLimit.login).toBe(5);
    expect(config.rateLimit.register).toBe(5);
    expect(config.rateLimit.authWindowSeconds).toBe(60);
  });

  it('applies defaults and insecure JWT placeholders in development', () => {
    const config = createDevelopmentConfig();

    expect(config.nodeEnv).toBe('development');
    expect(config.port).toBe(3000);
    expect(config.jwt.accessSecret).toBe(DEV_INSECURE_JWT_ACCESS_SECRET);
    expect(config.jwt.refreshSecret).toBe(DEV_INSECURE_JWT_REFRESH_SECRET);
    expect(config.jwt.accessExpiresIn).toBe('15m');
    expect(config.fileStorage.provider).toBe('local');
    expect(config.rateLimit.messages).toBe(20);
    expect(config.rateLimit.login).toBe(5);
    expect(config.rateLimit.register).toBe(5);
    expect(config.rateLimit.authWindowSeconds).toBe(60);
  });

  it('parses a test configuration', () => {
    const config = createTestConfig();

    expect(config.nodeEnv).toBe('test');
    expect(config.mongodbUri).toContain('pulse_chat_test');
  });

  it('lists every missing production secret in one error', () => {
    expect(() =>
      parseAppConfig({
        NODE_ENV: 'production',
        MONGODB_URI: 'mongodb://mongodb:27017/pulse_chat',
        REDIS_URL: 'redis://redis:6379',
        CORS_ORIGIN: 'https://chat.example.com',
      }),
    ).toThrow(ConfigValidationError);

    try {
      parseAppConfig({
        NODE_ENV: 'production',
        MONGODB_URI: 'mongodb://mongodb:27017/pulse_chat',
        REDIS_URL: 'redis://redis:6379',
        CORS_ORIGIN: 'https://chat.example.com',
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      const validationError = error as ConfigValidationError;
      expect(validationError.message).toContain('Invalid environment configuration');
      expect(validationError.message).toContain('Copy .env.example to .env');
      expect(validationError.issues.some((issue) => issue.variable === 'JWT_ACCESS_SECRET')).toBe(
        true,
      );
      expect(validationError.issues.some((issue) => issue.variable === 'JWT_REFRESH_SECRET')).toBe(
        true,
      );
    }
  });

  it('rejects development JWT placeholders in production', () => {
    expect(() =>
      parseAppConfig({
        ...validProductionEnv,
        JWT_ACCESS_SECRET: DEV_INSECURE_JWT_ACCESS_SECRET,
        JWT_REFRESH_SECRET: DEV_INSECURE_JWT_REFRESH_SECRET,
      }),
    ).toThrow(ConfigValidationError);
  });

  it('rejects an invalid MongoDB URI', () => {
    expect(() =>
      createDevelopmentConfig({
        MONGODB_URI: 'http://not-mongodb',
      }),
    ).toThrow(ConfigValidationError);
  });

  it('rejects an invalid Redis URL', () => {
    expect(() =>
      createDevelopmentConfig({
        REDIS_URL: 'http://not-redis',
      }),
    ).toThrow(ConfigValidationError);
  });

  it('requires FILE_STORAGE_PATH when the provider is local', () => {
    expect(() =>
      createDevelopmentConfig({
        FILE_STORAGE_PROVIDER: 'local',
        FILE_STORAGE_PATH: '',
      }),
    ).toThrow(ConfigValidationError);
  });

  it('allows an empty storage path when the provider is s3', () => {
    const config = createDevelopmentConfig({
      FILE_STORAGE_PROVIDER: 's3',
      FILE_STORAGE_PATH: '',
    });

    expect(config.fileStorage.provider).toBe('s3');
    expect(config.fileStorage.path).toBeUndefined();
  });

  it('rejects JWT secrets that are too short in production', () => {
    expect(() =>
      parseAppConfig({
        ...validProductionEnv,
        JWT_ACCESS_SECRET: 'too-short',
      }),
    ).toThrow(ConfigValidationError);
  });

  it('rejects an invalid duration format', () => {
    expect(() =>
      createDevelopmentConfig({
        JWT_ACCESS_EXPIRES_IN: '15 minutes',
      }),
    ).toThrow(ConfigValidationError);
  });

  it('rejects a non-positive rate limit', () => {
    expect(() =>
      createDevelopmentConfig({
        RATE_LIMIT_MESSAGES: '0',
      }),
    ).toThrow(ConfigValidationError);
  });

  it('rejects a non-positive login rate limit', () => {
    expect(() =>
      createDevelopmentConfig({
        RATE_LIMIT_LOGIN: '0',
      }),
    ).toThrow(ConfigValidationError);
  });
});
