import { createTestConfig } from '@pulse-chat/shared';

/**
 * Minimal environment for Vitest. Values are applied before any module that
 * reads configuration is imported.
 */
const testConfig = createTestConfig();

for (const [key, value] of Object.entries({
  NODE_ENV: testConfig.nodeEnv,
  PORT: String(testConfig.port),
  MONGODB_URI: testConfig.mongodbUri,
  REDIS_URL: testConfig.redisUrl,
  JWT_ACCESS_SECRET: testConfig.jwt.accessSecret,
  JWT_REFRESH_SECRET: testConfig.jwt.refreshSecret,
  JWT_ACCESS_EXPIRES_IN: testConfig.jwt.accessExpiresIn,
  JWT_REFRESH_EXPIRES_IN: testConfig.jwt.refreshExpiresIn,
  CORS_ORIGIN: testConfig.corsOrigin,
  FILE_STORAGE_PROVIDER: testConfig.fileStorage.provider,
  FILE_STORAGE_PATH: testConfig.fileStorage.path ?? '',
  RATE_LIMIT_MESSAGES: String(testConfig.rateLimit.messages),
  RATE_LIMIT_LOGIN: String(testConfig.rateLimit.login),
  RATE_LIMIT_REGISTER: String(testConfig.rateLimit.register),
  RATE_LIMIT_AUTH_WINDOW_SECONDS: String(testConfig.rateLimit.authWindowSeconds),
})) {
  process.env[key] = value;
}
