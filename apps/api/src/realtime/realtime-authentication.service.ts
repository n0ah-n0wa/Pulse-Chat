import { Injectable } from '@nestjs/common';

import { API_ERROR_CODES, AUTH_ERROR_CODES } from '@pulse-chat/shared';

import { TokenService, TokenVerificationError } from '../auth/token.service.js';
import type { AuthenticatedSocket, AuthenticatedSocketData } from './realtime.types.js';

export interface SocketAuthenticationErrorPayload {
  readonly code: string;
  readonly message: string;
}

@Injectable()
export class RealtimeAuthenticationService {
  constructor(private readonly tokenService: TokenService) {}

  authenticateSocket(socket: AuthenticatedSocket): AuthenticatedSocketData {
    const token = this.extractToken(socket);
    if (token === undefined) {
      throw this.createSocketAuthenticationError(
        API_ERROR_CODES.UNAUTHORIZED,
        'Authentication required.',
      );
    }

    try {
      const payload = this.tokenService.verifyAccessToken(token);
      return { userId: payload.sub };
    } catch (error) {
      if (error instanceof TokenVerificationError && error.code === 'TOKEN_EXPIRED') {
        throw this.createSocketAuthenticationError(
          AUTH_ERROR_CODES.TOKEN_EXPIRED,
          'Access token has expired.',
        );
      }

      throw this.createSocketAuthenticationError(
        API_ERROR_CODES.UNAUTHORIZED,
        'Authentication required.',
      );
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

  private createSocketAuthenticationError(code: string, message: string): Error {
    const error = new Error(message) as Error & { data: SocketAuthenticationErrorPayload };
    error.data = { code, message };
    return error;
  }
}
