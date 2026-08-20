import { z } from 'zod';

import type { AppConfig, NodeEnv } from './app-config.js';
import { ConfigValidationError, type ConfigValidationIssue } from './config-validation.error.js';
import { ALL_ENV_KEYS, ENV_KEYS } from './env-keys.js';

/** Minimum length for JWT signing secrets in production. */
export const JWT_SECRET_MIN_LENGTH = 32;

/**
 * Public, intentionally weak placeholders used only in development and test
 * when real secrets are not supplied. Never acceptable in production.
 */
export const DEV_INSECURE_JWT_ACCESS_SECRET = 'development-insecure-jwt-access-secret-32-chars-min';
export const DEV_INSECURE_JWT_REFRESH_SECRET =
  'development-insecure-jwt-refresh-secret-32-chars-min';

const DEFAULTS = {
  PORT: '3000',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '30d',
  FILE_STORAGE_PROVIDER: 'local',
  FILE_STORAGE_PATH: './storage',
  RATE_LIMIT_MESSAGES: '20',
  RATE_LIMIT_LOGIN: '5',
  RATE_LIMIT_REGISTER: '5',
  RATE_LIMIT_AUTH_WINDOW_SECONDS: '60',
} as const;

const nodeEnvSchema = z.enum(['development', 'test', 'production']);

const durationSchema = z
  .string()
  .trim()
  .min(1, 'must be a duration such as 15m, 1h or 30d')
  .regex(/^\d+[smhd]$/, 'must be a duration such as 15m, 1h or 30d');

const fileStorageProviderSchema = z.enum(['local', 's3']);

const mongodbUriSchema = z
  .string()
  .trim()
  .min(1, 'is required')
  .refine(
    (value) => value.startsWith('mongodb://') || value.startsWith('mongodb+srv://'),
    'must start with mongodb:// or mongodb+srv://',
  );

const redisUrlSchema = z
  .string()
  .trim()
  .min(1, 'is required')
  .refine(
    (value) => value.startsWith('redis://') || value.startsWith('rediss://'),
    'must start with redis:// or rediss://',
  );

const corsOriginSchema = z
  .string()
  .trim()
  .min(1, 'is required')
  .url('must be a valid URL such as http://localhost:8080');

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === '';
}

function pickEnv(env: Record<string, string | undefined>): Record<string, string | undefined> {
  const picked: Record<string, string | undefined> = {};
  for (const key of ALL_ENV_KEYS) {
    picked[key] = env[key];
  }
  return picked;
}

function applyDefaults(
  env: Record<string, string | undefined>,
  nodeEnv: NodeEnv,
): Record<string, string | undefined> {
  const withDefaults: Record<string, string | undefined> = { ...env };

  for (const [key, value] of Object.entries(DEFAULTS)) {
    withDefaults[key] ??= value;
  }

  if (nodeEnv === 'development' || nodeEnv === 'test') {
    if (isBlank(withDefaults[ENV_KEYS.JWT_ACCESS_SECRET])) {
      withDefaults[ENV_KEYS.JWT_ACCESS_SECRET] = DEV_INSECURE_JWT_ACCESS_SECRET;
    }
    if (isBlank(withDefaults[ENV_KEYS.JWT_REFRESH_SECRET])) {
      withDefaults[ENV_KEYS.JWT_REFRESH_SECRET] = DEV_INSECURE_JWT_REFRESH_SECRET;
    }
  }

  return withDefaults;
}

function buildSchema(nodeEnv: NodeEnv) {
  const jwtSecretSchema =
    nodeEnv === 'production'
      ? z
          .string()
          .trim()
          .min(
            JWT_SECRET_MIN_LENGTH,
            `must be at least ${String(JWT_SECRET_MIN_LENGTH)} characters`,
          )
      : z
          .string()
          .trim()
          .min(
            JWT_SECRET_MIN_LENGTH,
            `must be at least ${String(JWT_SECRET_MIN_LENGTH)} characters`,
          );

  return z
    .object({
      [ENV_KEYS.NODE_ENV]: nodeEnvSchema,
      [ENV_KEYS.PORT]: z.coerce
        .number()
        .int('must be an integer')
        .min(1, 'must be between 1 and 65535')
        .max(65535, 'must be between 1 and 65535'),
      [ENV_KEYS.MONGODB_URI]: mongodbUriSchema,
      [ENV_KEYS.REDIS_URL]: redisUrlSchema,
      [ENV_KEYS.JWT_ACCESS_SECRET]: jwtSecretSchema,
      [ENV_KEYS.JWT_REFRESH_SECRET]: jwtSecretSchema,
      [ENV_KEYS.JWT_ACCESS_EXPIRES_IN]: durationSchema,
      [ENV_KEYS.JWT_REFRESH_EXPIRES_IN]: durationSchema,
      [ENV_KEYS.CORS_ORIGIN]: corsOriginSchema,
      [ENV_KEYS.FILE_STORAGE_PROVIDER]: fileStorageProviderSchema,
      [ENV_KEYS.FILE_STORAGE_PATH]: z.string().trim().optional(),
      [ENV_KEYS.RATE_LIMIT_MESSAGES]: z.coerce
        .number()
        .int('must be an integer')
        .positive('must be greater than zero'),
      [ENV_KEYS.RATE_LIMIT_LOGIN]: z.coerce
        .number()
        .int('must be an integer')
        .positive('must be greater than zero'),
      [ENV_KEYS.RATE_LIMIT_REGISTER]: z.coerce
        .number()
        .int('must be an integer')
        .positive('must be greater than zero'),
      [ENV_KEYS.RATE_LIMIT_AUTH_WINDOW_SECONDS]: z.coerce
        .number()
        .int('must be an integer')
        .positive('must be greater than zero'),
    })
    .superRefine((values, ctx) => {
      if (values[ENV_KEYS.FILE_STORAGE_PROVIDER] === 'local') {
        const path = values[ENV_KEYS.FILE_STORAGE_PATH];
        if (path === undefined || path.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [ENV_KEYS.FILE_STORAGE_PATH],
            message: 'is required when FILE_STORAGE_PROVIDER is local',
          });
        }
      }

      if (nodeEnv === 'production') {
        if (values[ENV_KEYS.JWT_ACCESS_SECRET] === DEV_INSECURE_JWT_ACCESS_SECRET) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [ENV_KEYS.JWT_ACCESS_SECRET],
            message: 'must be a unique secret in production, not the development placeholder',
          });
        }
        if (values[ENV_KEYS.JWT_REFRESH_SECRET] === DEV_INSECURE_JWT_REFRESH_SECRET) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [ENV_KEYS.JWT_REFRESH_SECRET],
            message: 'must be a unique secret in production, not the development placeholder',
          });
        }
      }
    });
}

function zodIssuesToConfigIssues(issues: z.ZodIssue[]): ConfigValidationIssue[] {
  return issues.map((issue) => ({
    variable: issue.path.length > 0 ? String(issue.path[0]) : 'environment',
    message: issue.message,
  }));
}

function toAppConfig(raw: z.infer<ReturnType<typeof buildSchema>>): AppConfig {
  const provider = raw[ENV_KEYS.FILE_STORAGE_PROVIDER];
  const storagePath = raw[ENV_KEYS.FILE_STORAGE_PATH];

  return {
    nodeEnv: raw[ENV_KEYS.NODE_ENV],
    port: raw[ENV_KEYS.PORT],
    mongodbUri: raw[ENV_KEYS.MONGODB_URI],
    redisUrl: raw[ENV_KEYS.REDIS_URL],
    corsOrigin: raw[ENV_KEYS.CORS_ORIGIN],
    jwt: {
      accessSecret: raw[ENV_KEYS.JWT_ACCESS_SECRET],
      refreshSecret: raw[ENV_KEYS.JWT_REFRESH_SECRET],
      accessExpiresIn: raw[ENV_KEYS.JWT_ACCESS_EXPIRES_IN],
      refreshExpiresIn: raw[ENV_KEYS.JWT_REFRESH_EXPIRES_IN],
    },
    fileStorage: {
      provider,
      path: provider === 'local' ? storagePath : undefined,
    },
    rateLimit: {
      messages: raw[ENV_KEYS.RATE_LIMIT_MESSAGES],
      login: raw[ENV_KEYS.RATE_LIMIT_LOGIN],
      register: raw[ENV_KEYS.RATE_LIMIT_REGISTER],
      authWindowSeconds: raw[ENV_KEYS.RATE_LIMIT_AUTH_WINDOW_SECONDS],
    },
  };
}

export interface ParseAppConfigOptions {
  /**
   * When true, unknown environment keys are ignored. When false, the first
   * unknown key raises a validation error. Defaults to true.
   */
  ignoreUnknownKeys?: boolean;
}

/**
 * Validates a plain environment record and returns strongly typed configuration.
 *
 * The parser is pure: it never reads {@link process.env} itself, so the same
 * logic runs in production, tests and tooling with an explicit input object.
 */
export function parseAppConfig(
  env: Record<string, string | undefined>,
  options: ParseAppConfigOptions = {},
): AppConfig {
  const ignoreUnknownKeys = options.ignoreUnknownKeys ?? true;

  if (!ignoreUnknownKeys) {
    const unknownKeys = Object.keys(env).filter(
      (key) => !ALL_ENV_KEYS.includes(key as (typeof ALL_ENV_KEYS)[number]),
    );
    if (unknownKeys.length > 0) {
      throw new ConfigValidationError(
        unknownKeys.map((key) => ({
          variable: key,
          message: 'is not a recognised configuration variable',
        })),
      );
    }
  }

  const picked = pickEnv(env);

  const nodeEnvResult = nodeEnvSchema.safeParse(picked[ENV_KEYS.NODE_ENV] ?? 'development');
  if (!nodeEnvResult.success) {
    throw new ConfigValidationError(zodIssuesToConfigIssues(nodeEnvResult.error.issues));
  }

  const nodeEnv = nodeEnvResult.data;
  const withDefaults = applyDefaults(picked, nodeEnv);
  const schema = buildSchema(nodeEnv);
  const result = schema.safeParse(withDefaults);

  if (!result.success) {
    throw new ConfigValidationError(zodIssuesToConfigIssues(result.error.issues));
  }

  return toAppConfig(result.data);
}

/**
 * Returns a development configuration using documented insecure JWT placeholders.
 * Useful for local tooling; production must always call {@link parseAppConfig}.
 */
export function createDevelopmentConfig(
  overrides: Partial<Record<string, string | undefined>> = {},
): AppConfig {
  return parseAppConfig({
    NODE_ENV: 'development',
    MONGODB_URI: 'mongodb://localhost:27017/pulse_chat',
    REDIS_URL: 'redis://localhost:6379',
    CORS_ORIGIN: 'http://localhost:8080',
    ...overrides,
  });
}

/**
 * Returns a test configuration. JWT placeholders are applied automatically.
 */
export function createTestConfig(
  overrides: Partial<Record<string, string | undefined>> = {},
): AppConfig {
  return parseAppConfig({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://localhost:27017/pulse_chat_test',
    REDIS_URL: 'redis://localhost:6379/1',
    CORS_ORIGIN: 'http://localhost:5173',
    RATE_LIMIT_LOGIN: '1000',
    RATE_LIMIT_REGISTER: '1000',
    ...overrides,
  });
}
