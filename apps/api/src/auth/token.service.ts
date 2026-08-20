import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import type { UserRole } from '@pulse-chat/shared';

import { AppConfigService } from '../config/index.js';
import { addDurationToDate, parseDurationToSeconds } from './utils/duration.js';

/** Only HMAC-SHA256 is accepted; `alg: none` and asymmetric algorithms are rejected. */
const JWT_ALGORITHM = 'HS256' as const;

export const ACCESS_TOKEN_TYPE = 'access' as const;
export const REFRESH_TOKEN_TYPE = 'refresh' as const;

export interface AccessTokenPayload {
  readonly sub: string;
  readonly role: UserRole;
  readonly type: typeof ACCESS_TOKEN_TYPE;
}

export interface RefreshTokenPayload {
  readonly sub: string;
  readonly jti: string;
  readonly familyId: string;
  readonly type: typeof REFRESH_TOKEN_TYPE;
}

export interface SignedAccessToken {
  readonly token: string;
  readonly expiresIn: number;
}

export interface SignedRefreshToken {
  readonly token: string;
  readonly jti: string;
  readonly familyId: string;
  readonly expiresAt: Date;
}

export class TokenVerificationError extends Error {
  constructor(
    readonly code: 'TOKEN_EXPIRED' | 'INVALID_TOKEN',
    message: string,
  ) {
    super(message);
    this.name = 'TokenVerificationError';
  }
}

@Injectable()
export class TokenService {
  private readonly accessExpiresInSeconds: number;
  private readonly refreshExpiresInSeconds: number;

  constructor(
    private readonly config: AppConfigService,
    private readonly accessJwtService: JwtService,
    private readonly refreshJwtService: JwtService,
  ) {
    this.accessExpiresInSeconds = parseDurationToSeconds(config.jwt.accessExpiresIn);
    this.refreshExpiresInSeconds = parseDurationToSeconds(config.jwt.refreshExpiresIn);
  }

  get accessTokenExpiresIn(): number {
    return this.accessExpiresInSeconds;
  }

  signAccessToken(userId: string, role: UserRole): SignedAccessToken {
    const token = this.accessJwtService.sign(
      {
        sub: userId,
        role,
        type: ACCESS_TOKEN_TYPE,
      } satisfies AccessTokenPayload,
      {
        secret: this.config.jwt.accessSecret,
        expiresIn: this.accessExpiresInSeconds,
        algorithm: JWT_ALGORITHM,
      },
    );

    return {
      token,
      expiresIn: this.accessExpiresInSeconds,
    };
  }

  signRefreshToken(userId: string, jti: string, familyId: string): SignedRefreshToken {
    const token = this.refreshJwtService.sign(
      {
        sub: userId,
        jti,
        familyId,
        type: REFRESH_TOKEN_TYPE,
      } satisfies RefreshTokenPayload,
      {
        secret: this.config.jwt.refreshSecret,
        expiresIn: this.refreshExpiresInSeconds,
        algorithm: JWT_ALGORITHM,
      },
    );

    return {
      token,
      jti,
      familyId,
      expiresAt: addDurationToDate(this.config.jwt.refreshExpiresIn),
    };
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      const payload = this.accessJwtService.verify<AccessTokenPayload>(token, {
        secret: this.config.jwt.accessSecret,
        algorithms: [JWT_ALGORITHM],
      });

      if (payload.type !== ACCESS_TOKEN_TYPE || payload.sub === undefined) {
        throw new TokenVerificationError('INVALID_TOKEN', 'Invalid access token.');
      }

      return payload;
    } catch (error) {
      if (error instanceof TokenVerificationError) {
        throw error;
      }

      if (this.isExpiredError(error)) {
        throw new TokenVerificationError('TOKEN_EXPIRED', 'Access token has expired.');
      }

      throw new TokenVerificationError('INVALID_TOKEN', 'Invalid access token.');
    }
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    try {
      const payload = this.refreshJwtService.verify<RefreshTokenPayload>(token, {
        secret: this.config.jwt.refreshSecret,
        algorithms: [JWT_ALGORITHM],
      });

      if (
        payload.type !== REFRESH_TOKEN_TYPE ||
        payload.sub === undefined ||
        payload.jti === undefined ||
        payload.familyId === undefined
      ) {
        throw new TokenVerificationError('INVALID_TOKEN', 'Invalid refresh token.');
      }

      return payload;
    } catch (error) {
      if (error instanceof TokenVerificationError) {
        throw error;
      }

      if (this.isExpiredError(error)) {
        throw new TokenVerificationError('TOKEN_EXPIRED', 'Refresh token has expired.');
      }

      throw new TokenVerificationError('INVALID_TOKEN', 'Invalid refresh token.');
    }
  }

  private isExpiredError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      error.name === 'TokenExpiredError'
    );
  }
}
