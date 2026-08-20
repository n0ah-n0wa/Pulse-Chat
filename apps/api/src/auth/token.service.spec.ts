import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';

import { createTestConfig } from '@pulse-chat/shared';

import type { AppConfigService } from '../config/index.js';
import {
  ACCESS_TOKEN_TYPE,
  REFRESH_TOKEN_TYPE,
  TokenService,
  TokenVerificationError,
} from './token.service.js';

function createTokenService(overrides: Partial<AppConfigService['jwt']> = {}): TokenService {
  const jwt = createTestConfig().jwt;
  const config = {
    jwt: {
      ...jwt,
      ...overrides,
    },
  } as AppConfigService;

  const jwtService = new JwtService();
  return new TokenService(config, jwtService, jwtService);
}

describe('TokenService', () => {
  const service = createTokenService();

  it('rejects a refresh token presented as an access token', () => {
    const refresh = service.signRefreshToken('507f1f77bcf86cd799439011', 'jti-1', 'family-1');

    expect(() => service.verifyAccessToken(refresh.token)).toThrow(TokenVerificationError);
    try {
      service.verifyAccessToken(refresh.token);
    } catch (error) {
      expect((error as TokenVerificationError).code).toBe('INVALID_TOKEN');
    }
  });

  it('rejects an access token presented as a refresh token', () => {
    const access = service.signAccessToken('507f1f77bcf86cd799439011', 'USER');

    expect(() => service.verifyRefreshToken(access.token)).toThrow(TokenVerificationError);
  });

  it('rejects tokens signed with the wrong secret', () => {
    const other = createTokenService({
      accessSecret: 'a-different-access-secret-at-least-32-chars',
    });
    const access = other.signAccessToken('507f1f77bcf86cd799439011', 'USER');

    expect(() => service.verifyAccessToken(access.token)).toThrow(TokenVerificationError);
  });

  it('rejects unsigned tokens', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: '507f1f77bcf86cd799439011',
        role: 'USER',
        type: ACCESS_TOKEN_TYPE,
      }),
    ).toString('base64url');
    const unsigned = `${header}.${payload}.`;

    expect(() => service.verifyAccessToken(unsigned)).toThrow(TokenVerificationError);
  });

  it('rejects expired access tokens with TOKEN_EXPIRED', () => {
    const jwtService = new JwtService();
    const config = createTestConfig();
    const token = jwtService.sign(
      { sub: '507f1f77bcf86cd799439011', role: 'USER', type: ACCESS_TOKEN_TYPE },
      { secret: config.jwt.accessSecret, expiresIn: '-1s', algorithm: 'HS256' },
    );

    try {
      service.verifyAccessToken(token);
      expect.unreachable('expected expired token to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(TokenVerificationError);
      expect((error as TokenVerificationError).code).toBe('TOKEN_EXPIRED');
    }
  });

  it('rejects access tokens that omit the type claim', () => {
    const jwtService = new JwtService();
    const config = createTestConfig();
    const token = jwtService.sign(
      { sub: '507f1f77bcf86cd799439011', role: 'USER' },
      { secret: config.jwt.accessSecret, expiresIn: 60, algorithm: 'HS256' },
    );

    expect(() => service.verifyAccessToken(token)).toThrow(TokenVerificationError);
  });

  it('signs refresh tokens with a distinct type claim', () => {
    const refresh = service.signRefreshToken('507f1f77bcf86cd799439011', 'jti-1', 'family-1');
    const payload = service.verifyRefreshToken(refresh.token);

    expect(payload.type).toBe(REFRESH_TOKEN_TYPE);
    expect(payload.jti).toBe('jti-1');
  });
});
