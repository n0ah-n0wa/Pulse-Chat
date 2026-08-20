import { describe, expect, it } from 'vitest';

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './password.constants.js';
import {
  loginSchema,
  REFRESH_TOKEN_MAX_LENGTH,
  refreshTokenRequestSchema,
  registerSchema,
} from './auth-validation.js';

describe('registerSchema', () => {
  it('accepts valid registration input', () => {
    expect(
      registerSchema.parse({
        username: 'alex',
        email: 'alex@example.com',
        password: 'secure-password',
        displayName: 'Alex',
      }),
    ).toEqual({
      username: 'alex',
      email: 'alex@example.com',
      password: 'secure-password',
      displayName: 'Alex',
    });
  });

  it('rejects passwords that are too short', () => {
    expect(() =>
      registerSchema.parse({
        username: 'alex',
        email: 'alex@example.com',
        password: 'a'.repeat(PASSWORD_MIN_LENGTH - 1),
        displayName: 'Alex',
      }),
    ).toThrow(/at least 8/);
  });
});

describe('loginSchema', () => {
  it('accepts valid login input', () => {
    expect(
      loginSchema.parse({
        email: 'alex@example.com',
        password: 'secret',
      }),
    ).toEqual({
      email: 'alex@example.com',
      password: 'secret',
    });
  });

  it('rejects oversized login passwords', () => {
    expect(() =>
      loginSchema.parse({
        email: 'alex@example.com',
        password: 'a'.repeat(PASSWORD_MAX_LENGTH + 1),
      }),
    ).toThrow(/at most 128/);
  });
});

describe('refreshTokenRequestSchema', () => {
  it('rejects oversized refresh tokens', () => {
    expect(() =>
      refreshTokenRequestSchema.parse({
        refreshToken: 'a'.repeat(REFRESH_TOKEN_MAX_LENGTH + 1),
      }),
    ).toThrow(/at most 4096/);
  });
});
