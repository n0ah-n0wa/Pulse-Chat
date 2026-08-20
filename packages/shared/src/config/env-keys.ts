/**
 * Canonical environment variable names. Values are read only by the config
 * parser; application code receives the typed {@link AppConfig} instead.
 */
export const ENV_KEYS = {
  NODE_ENV: 'NODE_ENV',
  PORT: 'PORT',
  MONGODB_URI: 'MONGODB_URI',
  REDIS_URL: 'REDIS_URL',
  JWT_ACCESS_SECRET: 'JWT_ACCESS_SECRET',
  JWT_REFRESH_SECRET: 'JWT_REFRESH_SECRET',
  JWT_ACCESS_EXPIRES_IN: 'JWT_ACCESS_EXPIRES_IN',
  JWT_REFRESH_EXPIRES_IN: 'JWT_REFRESH_EXPIRES_IN',
  CORS_ORIGIN: 'CORS_ORIGIN',
  FILE_STORAGE_PROVIDER: 'FILE_STORAGE_PROVIDER',
  FILE_STORAGE_PATH: 'FILE_STORAGE_PATH',
  RATE_LIMIT_MESSAGES: 'RATE_LIMIT_MESSAGES',
  RATE_LIMIT_LOGIN: 'RATE_LIMIT_LOGIN',
  RATE_LIMIT_REGISTER: 'RATE_LIMIT_REGISTER',
  RATE_LIMIT_AUTH_WINDOW_SECONDS: 'RATE_LIMIT_AUTH_WINDOW_SECONDS',
} as const;

export type EnvKey = (typeof ENV_KEYS)[keyof typeof ENV_KEYS];

/** Every variable the parser understands. */
export const ALL_ENV_KEYS = Object.values(ENV_KEYS);
