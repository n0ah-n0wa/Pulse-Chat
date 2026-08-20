import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { API_ERROR_CODES, AUTH_ERROR_CODES } from '@pulse-chat/shared';

import { ApiException } from '../../common/errors/api.exception.js';
import { AuthGuard } from './auth.guard.js';
import { TokenService, TokenVerificationError } from '../token.service.js';
import type { AuthenticatedRequest } from '../types/authenticated-request.types.js';

function createContext(request: AuthenticatedRequest) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  };
}

describe('AuthGuard', () => {
  const tokenService = {
    verifyAccessToken: vi.fn(),
  } satisfies Pick<TokenService, 'verifyAccessToken'>;

  const guard = new AuthGuard(tokenService as unknown as TokenService);

  it('allows requests with a valid access token', () => {
    vi.mocked(tokenService.verifyAccessToken).mockReturnValue({
      sub: '507f1f77bcf86cd799439011',
      role: 'USER',
      type: 'access',
    });

    const request = {
      headers: { authorization: 'Bearer token' },
    } as AuthenticatedRequest;

    expect(guard.canActivate(createContext(request) as never)).toBe(true);
    expect(request.user).toEqual({ userId: '507f1f77bcf86cd799439011' });
  });

  it('rejects requests without a bearer token', () => {
    const emptyRequest = {} as AuthenticatedRequest;
    expect(() => guard.canActivate(createContext(emptyRequest) as never)).toThrow(ApiException);

    try {
      guard.canActivate(createContext(emptyRequest) as never);
    } catch (error) {
      expect((error as ApiException).code).toBe(API_ERROR_CODES.UNAUTHORIZED);
    }
  });

  it('rejects expired access tokens', () => {
    vi.mocked(tokenService.verifyAccessToken).mockImplementation(() => {
      throw new TokenVerificationError('TOKEN_EXPIRED', 'expired');
    });

    try {
      guard.canActivate(
        createContext({
          headers: { authorization: 'Bearer expired' },
        } as AuthenticatedRequest) as never,
      );
    } catch (error) {
      expect(error).toBeInstanceOf(ApiException);
      expect((error as ApiException).getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      expect((error as ApiException).code).toBe(AUTH_ERROR_CODES.TOKEN_EXPIRED);
    }
  });
});
