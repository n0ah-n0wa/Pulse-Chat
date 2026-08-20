import { HttpStatus, Inject, Injectable } from '@nestjs/common';

import {
  AUTH_ERROR_CODES,
  TOKEN_TYPE,
  USER_ERROR_CODES,
  type AuthSessionResponse,
  type AuthTokensResponse,
  type CurrentUserProfile,
  type LoginInput,
  type RegisterInput,
} from '@pulse-chat/shared';

import { ApiException } from '../common/errors/api.exception.js';
import { toCurrentUserProfile } from '../users/user-profile.mapper.js';
import type { UserRecord, UserRepository } from '../users/user.repository.interface.js';
import { USER_REPOSITORY } from '../users/users.tokens.js';
import { PASSWORD_HASHER, type PasswordHasher } from './password-hasher.interface.js';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
} from './refresh-token.repository.interface.js';
import { TokenService, TokenVerificationError } from './token.service.js';
import {
  createRefreshTokenJti,
  createTokenFamilyId,
  hashRefreshToken,
  refreshTokenHashEquals,
} from './utils/token-hash.js';

/**
 * Precomputed bcrypt hash used when no user exists so login always performs a
 * password comparison and does not leak account existence through timing.
 */
const DUMMY_PASSWORD_HASH =
  '$2b$12$t8Z4vLtbEoq/vMkN8XmXJuUSJbjCC2zEWfhpKgxWaJ6tPK4BfVh6u';

@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
    private readonly tokenService: TokenService,
  ) {}

  async register(input: RegisterInput): Promise<AuthSessionResponse> {
    if (await this.users.findByEmail(input.email)) {
      throw new ApiException(
        AUTH_ERROR_CODES.EMAIL_ALREADY_REGISTERED,
        'An account with this email already exists.',
        HttpStatus.CONFLICT,
      );
    }

    if (await this.users.findByUsername(input.username)) {
      throw new ApiException(
        AUTH_ERROR_CODES.USERNAME_ALREADY_TAKEN,
        'This username is already taken.',
        HttpStatus.CONFLICT,
      );
    }

    const passwordHash = await this.passwordHasher.hash(input.password);

    let user: UserRecord;
    try {
      user = await this.users.create({
        username: input.username,
        email: input.email,
        passwordHash,
        displayName: input.displayName,
      });
    } catch (error) {
      this.rethrowDuplicateUserError(error);
      throw error;
    }

    return this.createSession(user);
  }

  async login(input: LoginInput): Promise<AuthSessionResponse> {
    const user = await this.users.findByEmail(input.email);
    const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const passwordMatches = await this.passwordHasher.verify(input.password, passwordHash);

    if (user === null || !passwordMatches) {
      throw new ApiException(
        AUTH_ERROR_CODES.INVALID_CREDENTIALS,
        'Invalid email or password.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    return this.createSession(user);
  }

  async refresh(refreshToken: string): Promise<AuthTokensResponse> {
    const payload = this.verifyRefreshTokenOrThrow(refreshToken);
    const claimed = await this.refreshTokens.claimActiveByJti(payload.jti);

    if (claimed === null) {
      return this.rejectUnclaimableRefreshToken(payload.jti, refreshToken);
    }

    if (!refreshTokenHashEquals(claimed.tokenHash, refreshToken)) {
      await this.refreshTokens.revokeFamily(claimed.familyId);
      throw new ApiException(
        AUTH_ERROR_CODES.INVALID_REFRESH_TOKEN,
        'Refresh token is invalid.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const user = await this.users.findById(payload.sub);

    if (user === null) {
      await this.refreshTokens.revokeFamily(claimed.familyId);
      throw new ApiException(
        AUTH_ERROR_CODES.INVALID_REFRESH_TOKEN,
        'Refresh token is invalid.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    return this.issueTokenPair(user.id, user.role, claimed.familyId);
  }

  async logout(refreshToken: string): Promise<void> {
    try {
      const payload = this.tokenService.verifyRefreshToken(refreshToken);
      const stored = await this.refreshTokens.findByJti(payload.jti);

      if (stored !== null && refreshTokenHashEquals(stored.tokenHash, refreshToken)) {
        await this.refreshTokens.revokeByJti(payload.jti);
      }
    } catch {
      // Logout is idempotent: invalid or expired tokens still succeed.
    }
  }

  async getCurrentUser(userId: string): Promise<CurrentUserProfile> {
    const user = await this.users.findById(userId);

    if (user === null) {
      throw new ApiException(USER_ERROR_CODES.USER_NOT_FOUND, 'User not found.', HttpStatus.NOT_FOUND);
    }

    return toCurrentUserProfile(user);
  }

  private async createSession(user: UserRecord): Promise<AuthSessionResponse> {
    const familyId = createTokenFamilyId();
    const tokens = await this.issueTokenPair(user.id, user.role, familyId);

    return {
      ...tokens,
      user: toCurrentUserProfile(user),
    };
  }

  private async issueTokenPair(
    userId: string,
    role: UserRecord['role'],
    familyId: string,
  ): Promise<AuthTokensResponse> {
    const access = this.tokenService.signAccessToken(userId, role);
    const jti = createRefreshTokenJti();
    const refresh = this.tokenService.signRefreshToken(userId, jti, familyId);

    await this.refreshTokens.create({
      jti,
      userId,
      familyId,
      tokenHash: hashRefreshToken(refresh.token),
      expiresAt: refresh.expiresAt,
    });

    return {
      accessToken: access.token,
      refreshToken: refresh.token,
      accessTokenExpiresIn: access.expiresIn,
      tokenType: TOKEN_TYPE,
    };
  }

  private async rejectUnclaimableRefreshToken(jti: string, refreshToken: string): Promise<never> {
    const stored = await this.refreshTokens.findByJti(jti);

    if (stored !== null && refreshTokenHashEquals(stored.tokenHash, refreshToken)) {
      if (stored.expiresAt.getTime() <= Date.now() && stored.revokedAt === undefined) {
        throw new ApiException(
          AUTH_ERROR_CODES.TOKEN_EXPIRED,
          'Refresh token has expired.',
          HttpStatus.UNAUTHORIZED,
        );
      }

      await this.refreshTokens.revokeFamily(stored.familyId);
      throw new ApiException(
        AUTH_ERROR_CODES.REFRESH_TOKEN_REVOKED,
        'Refresh token has been revoked.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    throw new ApiException(
      AUTH_ERROR_CODES.INVALID_REFRESH_TOKEN,
      'Refresh token is invalid.',
      HttpStatus.UNAUTHORIZED,
    );
  }

  private verifyRefreshTokenOrThrow(refreshToken: string) {
    try {
      return this.tokenService.verifyRefreshToken(refreshToken);
    } catch (error) {
      if (error instanceof TokenVerificationError && error.code === 'TOKEN_EXPIRED') {
        throw new ApiException(
          AUTH_ERROR_CODES.TOKEN_EXPIRED,
          'Refresh token has expired.',
          HttpStatus.UNAUTHORIZED,
        );
      }

      throw new ApiException(
        AUTH_ERROR_CODES.INVALID_REFRESH_TOKEN,
        'Refresh token is invalid.',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  private rethrowDuplicateUserError(error: unknown): void {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000 &&
      'keyPattern' in error &&
      typeof error.keyPattern === 'object' &&
      error.keyPattern !== null
    ) {
      if ('email' in error.keyPattern) {
        throw new ApiException(
          AUTH_ERROR_CODES.EMAIL_ALREADY_REGISTERED,
          'An account with this email already exists.',
          HttpStatus.CONFLICT,
        );
      }

      if ('username' in error.keyPattern) {
        throw new ApiException(
          AUTH_ERROR_CODES.USERNAME_ALREADY_TAKEN,
          'This username is already taken.',
          HttpStatus.CONFLICT,
        );
      }
    }
  }
}
