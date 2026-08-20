import { z } from 'zod';

import { emailSchema, usernameSchema } from '../users/user-validation.js';
import { DISPLAY_NAME_MAX_LENGTH } from '../users/user-validation.js';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './password.constants.js';

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${String(PASSWORD_MIN_LENGTH)} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${String(PASSWORD_MAX_LENGTH)} characters`);

/** Upper bound for refresh-token request bodies (JWTs are far smaller). */
export const REFRESH_TOKEN_MAX_LENGTH = 4096;

export const registerSchema = z
  .object({
    username: usernameSchema,
    email: emailSchema,
    password: passwordSchema,
    displayName: z
      .string()
      .trim()
      .min(1, 'Display name is required')
      .max(
        DISPLAY_NAME_MAX_LENGTH,
        `Display name must be at most ${String(DISPLAY_NAME_MAX_LENGTH)} characters`,
      ),
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z
      .string()
      .min(1, 'Password is required')
      .max(
        PASSWORD_MAX_LENGTH,
        `Password must be at most ${String(PASSWORD_MAX_LENGTH)} characters`,
      ),
  })
  .strict();

export const refreshTokenRequestSchema = z
  .object({
    refreshToken: z
      .string()
      .trim()
      .min(1, 'Refresh token is required')
      .max(
        REFRESH_TOKEN_MAX_LENGTH,
        `Refresh token must be at most ${String(REFRESH_TOKEN_MAX_LENGTH)} characters`,
      ),
  })
  .strict();

export const logoutRequestSchema = refreshTokenRequestSchema;

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenRequestSchema>;
export type LogoutInput = z.infer<typeof logoutRequestSchema>;
