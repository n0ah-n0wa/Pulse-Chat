import { z } from 'zod';

import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from '../constants.js';
import type { UserRole } from './user-role.js';

/** Username may contain letters, numbers, `_` and `-` (specification section 7). */
export const USERNAME_PATTERN = /^[A-Za-z0-9_-]+$/;

export const usernameSchema = z
  .string()
  .trim()
  .min(USERNAME_MIN_LENGTH, `Username must be at least ${String(USERNAME_MIN_LENGTH)} characters`)
  .max(USERNAME_MAX_LENGTH, `Username must be at most ${String(USERNAME_MAX_LENGTH)} characters`)
  .regex(USERNAME_PATTERN, 'Username may contain letters, numbers, _ and - only');

export const emailSchema = z
  .string()
  .trim()
  .email('Email must be a valid email address')
  .max(254, 'Email must be at most 254 characters');

/** Maximum length for a display name shown in the product UI. */
export const DISPLAY_NAME_MAX_LENGTH = 64;

/** Maximum length for a profile biography. */
export const BIO_MAX_LENGTH = 500;

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'Display name is required')
  .max(
    DISPLAY_NAME_MAX_LENGTH,
    `Display name must be at most ${String(DISPLAY_NAME_MAX_LENGTH)} characters`,
  );

export const bioSchema = z
  .string()
  .trim()
  .max(BIO_MAX_LENGTH, `Bio must be at most ${String(BIO_MAX_LENGTH)} characters`);

export const updateUserProfileSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    username: usernameSchema.optional(),
    bio: bioSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.displayName !== undefined || value.username !== undefined || value.bio !== undefined,
    {
      message: 'At least one profile field must be provided',
    },
  );

/** Client settings form: always submits the visible profile fields. */
export const settingsProfileSchema = z
  .object({
    displayName: displayNameSchema,
    username: usernameSchema,
    bio: bioSchema,
  })
  .strict();

export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;
export type SettingsProfileInput = z.infer<typeof settingsProfileSchema>;

/** Fields written when creating a user document (password already hashed). */
export interface CreateUserInput {
  readonly username: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly displayName: string;
  readonly avatarUrl?: string;
  readonly bio?: string;
  readonly role?: UserRole;
}
