import { HttpStatus, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';

import {
  API_ERROR_CODES,
  AUTH_ERROR_CODES,
  type ApiErrorCode,
  type AuthErrorCode,
} from '@pulse-chat/shared';

import { ApiException } from '../../common/errors/api.exception.js';
import { RequestContextService } from '../../infrastructure/logging/request-context.service.js';
import { StructuredLoggerService } from '../../infrastructure/logging/structured-logger.service.js';
import { TokenService, TokenVerificationError } from '../token.service.js';
import type { AuthenticatedRequest } from '../types/authenticated-request.types.js';
import { extractBearerToken } from '../utils/extract-bearer-token.js';

/** Validates Bearer access tokens and attaches the authenticated user to the request. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly requestContext: RequestContextService,
    private readonly logger: StructuredLoggerService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request);

    if (token === undefined) {
      this.reject('missing_token', API_ERROR_CODES.UNAUTHORIZED, 'Authentication required.');
    }

    try {
      const payload = this.tokenService.verifyAccessToken(token);
      request.user = { userId: payload.sub };
      this.requestContext.assign({ userId: payload.sub });
      return true;
    } catch (error) {
      if (error instanceof TokenVerificationError && error.code === 'TOKEN_EXPIRED') {
        this.reject('token_expired', AUTH_ERROR_CODES.TOKEN_EXPIRED, 'Access token has expired.');
      }

      this.reject('invalid_token', API_ERROR_CODES.UNAUTHORIZED, 'Authentication required.');
    }
  }

  private reject(reason: string, code: ApiErrorCode | AuthErrorCode, message: string): never {
    this.logger.warn('auth.failure', { reason, code });
    throw new ApiException(code, message, HttpStatus.UNAUTHORIZED);
  }
}
