import { Injectable } from '@nestjs/common';

import { API_ERROR_CODES, AUTH_ERROR_CODES } from '@pulse-chat/shared';

import { TokenService, TokenVerificationError } from '../auth/token.service.js';
import { StructuredLoggerService } from '../infrastructure/logging/structured-logger.service.js';
import type { AuthenticatedSocket, AuthenticatedSocketData } from './realtime.types.js';

export interface SocketAuthenticationErrorPayload {
  readonly code: string;
  readonly message: string;
}

@Injectable()
export class RealtimeAuthenticationService {
  constructor(
    private readonly tokenService: TokenService,
    private readonly logger: StructuredLoggerService,
  ) {}

  authenticateSocket(socket: AuthenticatedSocket, requestId: string): AuthenticatedSocketData {
    const token = this.extractToken(socket);
    if (token === undefined) {
      this.reject('missing_token', API_ERROR_CODES.UNAUTHORIZED, 'Authentication required.');
    }

    try {
      const payload = this.tokenService.verifyAccessToken(token);
      return { userId: payload.sub, requestId };
    } catch (error) {
      if (error instanceof TokenVerificationError && error.code === 'TOKEN_EXPIRED') {
        this.reject('token_expired', AUTH_ERROR_CODES.TOKEN_EXPIRED, 'Access token has expired.');
      }

      this.reject('invalid_token', API_ERROR_CODES.UNAUTHORIZED, 'Authentication required.');
    }
  }

  private extractToken(socket: AuthenticatedSocket): string | undefined {
    const handshakeAuth = socket.handshake.auth as { token?: unknown } | undefined;
    if (typeof handshakeAuth?.token === 'string' && handshakeAuth.token.trim().length > 0) {
      return handshakeAuth.token.trim();
    }

    const authorization = socket.handshake.headers.authorization;
    if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
      const token = authorization.slice('Bearer '.length).trim();
      return token.length === 0 ? undefined : token;
    }

    return undefined;
  }

  private reject(reason: string, code: string, message: string): never {
    this.logger.warn('auth.failure', { reason, code, transport: 'websocket' });
    throw this.createSocketAuthenticationError(code, message);
  }

  private createSocketAuthenticationError(code: string, message: string): Error {
    const error = new Error(message) as Error & { data: SocketAuthenticationErrorPayload };
    error.data = { code, message };
    return error;
  }
}
