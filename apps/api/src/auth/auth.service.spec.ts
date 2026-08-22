import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTH_ERROR_CODES } from '@pulse-chat/shared';

import type { StructuredLoggerService } from '../infrastructure/logging/structured-logger.service.js';
import type { UserRepository } from '../users/user.repository.interface.js';
import { AuthService } from './auth.service.js';
import type { PasswordHasher } from './password-hasher.interface.js';
import type { RefreshTokenRepository } from './refresh-token.repository.interface.js';
import { TokenService, TokenVerificationError } from './token.service.js';
import { hashRefreshToken } from './utils/token-hash.js';

describe('AuthService', () => {
  const findById = vi.fn<UserRepository['findById']>();
  const findByEmail = vi.fn<UserRepository['findByEmail']>();
  const findByUsername = vi.fn<UserRepository['findByUsername']>();
  const createUser = vi.fn<UserRepository['create']>();
  const updateProfile = vi.fn<UserRepository['updateProfile']>();

  const createRefreshToken = vi.fn<RefreshTokenRepository['create']>();
  const findByJti = vi.fn<RefreshTokenRepository['findByJti']>();
  const claimActiveByJti = vi.fn<RefreshTokenRepository['claimActiveByJti']>();
  const revokeByJti = vi.fn<RefreshTokenRepository['revokeByJti']>();
  const revokeFamily = vi.fn<RefreshTokenRepository['revokeFamily']>();

  const hashPassword = vi.fn<PasswordHasher['hash']>();
  const verifyPassword = vi.fn<PasswordHasher['verify']>();

  const signAccessToken = vi.fn<TokenService['signAccessToken']>();
  const signRefreshToken = vi.fn<TokenService['signRefreshToken']>();
  const verifyRefreshToken = vi.fn<TokenService['verifyRefreshToken']>();

  const users: UserRepository = {
    findById,
    findByEmail,
    findByUsername,
    findByUsernames: vi.fn(),
    findByIds: vi.fn(),
    searchByQuery: vi.fn(),
    create: createUser,
    updateProfile,
    updateLastSeenAt: vi.fn(),
  };

  const refreshTokens: RefreshTokenRepository = {
    create: createRefreshToken,
    findByJti,
    claimActiveByJti,
    revokeByJti,
    revokeFamily,
  };

  const passwordHasher: PasswordHasher = {
    hash: hashPassword,
    verify: verifyPassword,
  };

  const tokenService = {
    signAccessToken,
    signRefreshToken,
    verifyRefreshToken,
    accessTokenExpiresIn: 900,
  } as unknown as TokenService;

  const logger = {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } satisfies Pick<StructuredLoggerService, 'log' | 'warn' | 'error'>;

  const service = new AuthService(
    users,
    refreshTokens,
    passwordHasher,
    tokenService,
    logger as unknown as StructuredLoggerService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers a new user and returns tokens without exposing the password hash', async () => {
    findByEmail.mockResolvedValue(null);
    findByUsername.mockResolvedValue(null);
    hashPassword.mockResolvedValue('hashed-password');
    createUser.mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      username: 'alex',
      email: 'alex@example.com',
      displayName: 'Alex',
      role: 'USER',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    signAccessToken.mockReturnValue({ token: 'access', expiresIn: 900 });
    signRefreshToken.mockReturnValue({
      token: 'refresh',
      jti: 'jti-1',
      familyId: 'family-1',
      expiresAt: new Date('2026-12-31T00:00:00.000Z'),
    });
    createRefreshToken.mockResolvedValue({
      jti: 'jti-1',
      userId: '507f1f77bcf86cd799439011',
      familyId: 'family-1',
      tokenHash: 'hash',
      expiresAt: new Date('2026-12-31T00:00:00.000Z'),
    });

    await expect(
      service.register({
        username: 'alex',
        email: 'alex@example.com',
        password: 'secure-password',
        displayName: 'Alex',
      }),
    ).resolves.toMatchObject({
      accessToken: 'access',
      refreshToken: 'refresh',
      user: {
        id: '507f1f77bcf86cd799439011',
        email: 'alex@example.com',
      },
    });

    expect(hashPassword).toHaveBeenCalledWith('secure-password');
  });

  it('rejects duplicate email during registration', async () => {
    findByEmail.mockResolvedValue({
      id: 'existing',
      username: 'other',
      email: 'alex@example.com',
      displayName: 'Other',
      role: 'USER',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      service.register({
        username: 'alex',
        email: 'alex@example.com',
        password: 'secure-password',
        displayName: 'Alex',
      }),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.EMAIL_ALREADY_REGISTERED });
  });

  it('rejects unknown emails without skipping password verification', async () => {
    findByEmail.mockResolvedValue(null);
    verifyPassword.mockResolvedValue(false);

    await expect(
      service.login({ email: 'missing@example.com', password: 'secret' }),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.INVALID_CREDENTIALS });

    expect(verifyPassword).toHaveBeenCalledWith('secret', expect.any(String));
    expect(logger.warn).toHaveBeenCalledWith(
      'auth.failure',
      expect.objectContaining({
        reason: 'invalid_credentials',
        code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
      }),
    );
    const failureCalls: unknown = logger.warn.mock.calls;
    expect(JSON.stringify(failureCalls)).not.toContain('missing@example.com');
    expect(JSON.stringify(failureCalls)).not.toContain('secret');
  });

  it('rotates refresh tokens by atomically claiming the previous session', async () => {
    verifyRefreshToken.mockReturnValue({
      sub: '507f1f77bcf86cd799439011',
      jti: 'old-jti',
      familyId: 'family-1',
      type: 'refresh',
    });
    const refreshToken = 'existing-refresh-token';
    claimActiveByJti.mockResolvedValue({
      jti: 'old-jti',
      userId: '507f1f77bcf86cd799439011',
      familyId: 'family-1',
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + 60_000),
    });
    findById.mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      username: 'alex',
      email: 'alex@example.com',
      displayName: 'Alex',
      role: 'USER',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    signAccessToken.mockReturnValue({ token: 'new-access', expiresIn: 900 });
    signRefreshToken.mockReturnValue({
      token: 'new-refresh',
      jti: 'new-jti',
      familyId: 'family-1',
      expiresAt: new Date(Date.now() + 60_000),
    });
    createRefreshToken.mockResolvedValue({
      jti: 'new-jti',
      userId: '507f1f77bcf86cd799439011',
      familyId: 'family-1',
      tokenHash: 'hash',
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(service.refresh(refreshToken)).resolves.toMatchObject({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });

    expect(claimActiveByJti).toHaveBeenCalledWith('old-jti');
    expect(revokeByJti).not.toHaveBeenCalled();
  });

  it('revokes the token family when a revoked refresh token is reused after the grace window', async () => {
    verifyRefreshToken.mockReturnValue({
      sub: '507f1f77bcf86cd799439011',
      jti: 'old-jti',
      familyId: 'family-1',
      type: 'refresh',
    });
    const replayToken = 'revoked-refresh-token';
    claimActiveByJti.mockResolvedValue(null);
    findByJti.mockResolvedValue({
      jti: 'old-jti',
      userId: '507f1f77bcf86cd799439011',
      familyId: 'family-1',
      tokenHash: hashRefreshToken(replayToken),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(Date.now() - 11_000),
    });

    await expect(service.refresh(replayToken)).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.REFRESH_TOKEN_REVOKED,
    });
    expect(revokeFamily).toHaveBeenCalledWith('family-1');
    expect(logger.warn).toHaveBeenCalledWith(
      'auth.failure',
      expect.objectContaining({
        reason: 'refresh_token_revoked',
        code: AUTH_ERROR_CODES.REFRESH_TOKEN_REVOKED,
      }),
    );
    const lastFailure: unknown = logger.warn.mock.calls.at(-1)?.[1];
    expect(JSON.stringify(lastFailure)).not.toContain(replayToken);
  });

  it('does not wipe the family when a concurrent refresh loses the atomic claim', async () => {
    verifyRefreshToken.mockReturnValue({
      sub: '507f1f77bcf86cd799439011',
      jti: 'old-jti',
      familyId: 'family-1',
      type: 'refresh',
    });
    const racedToken = 'raced-refresh-token';
    claimActiveByJti.mockResolvedValue(null);
    findByJti.mockResolvedValue({
      jti: 'old-jti',
      userId: '507f1f77bcf86cd799439011',
      familyId: 'family-1',
      tokenHash: hashRefreshToken(racedToken),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
    });

    await expect(service.refresh(racedToken)).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.REFRESH_TOKEN_REVOKED,
    });
    expect(revokeFamily).not.toHaveBeenCalled();
  });

  it('revokes refresh tokens on logout', async () => {
    verifyRefreshToken.mockReturnValue({
      sub: '507f1f77bcf86cd799439011',
      jti: 'jti-1',
      familyId: 'family-1',
      type: 'refresh',
    });
    const logoutToken = 'logout-refresh-token';
    findByJti.mockResolvedValue({
      jti: 'jti-1',
      userId: '507f1f77bcf86cd799439011',
      familyId: 'family-1',
      tokenHash: hashRefreshToken(logoutToken),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await service.logout(logoutToken);
    expect(revokeByJti).toHaveBeenCalledWith('jti-1');
  });

  it('does not leak token validity when logout receives an expired token', async () => {
    verifyRefreshToken.mockImplementation(() => {
      throw new TokenVerificationError('TOKEN_EXPIRED', 'expired');
    });

    await expect(service.logout('expired-refresh-token')).resolves.toBeUndefined();
    expect(revokeByJti).not.toHaveBeenCalled();
  });
});
