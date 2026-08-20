import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';

import { API_ERROR_CODES, AUTH_ERROR_CODES } from '@pulse-chat/shared';

import { ApiException } from '../../common/errors/api.exception.js';
import { TokenService, TokenVerificationError } from '../token.service.js';
import type { AuthenticatedRequest } from '../types/authenticated-request.types.js';
import { extractBearerToken } from '../utils/extract-bearer-token.js';

/** Validates Bearer access tokens and attaches the authenticated user to the request. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly tokenService: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request);

    if (token === undefined) {
      throw new ApiException(
        API_ERROR_CODES.UNAUTHORIZED,
        'Authentication required.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    try {
      const payload = this.tokenService.verifyAccessToken(token);
      request.user = { userId: payload.sub };
      return true;
    } catch (error) {
      if (error instanceof TokenVerificationError && error.code === 'TOKEN_EXPIRED') {
        throw new ApiException(
          AUTH_ERROR_CODES.TOKEN_EXPIRED,
          'Access token has expired.',
          HttpStatus.UNAUTHORIZED,
        );
      }

      throw new ApiException(
        API_ERROR_CODES.UNAUTHORIZED,
        'Authentication required.',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }
}
