import { describe, expect, it, vi } from 'vitest';

import { API_ERROR_CODES, AUTH_ERROR_CODES } from '@pulse-chat/shared';

import { TokenService, TokenVerificationError } from '../auth/token.service.js';
import type { StructuredLoggerService } from '../infrastructure/logging/structured-logger.service.js';
import { RealtimeAuthenticationService } from './realtime-authentication.service.js';
import type { AuthenticatedSocket } from './realtime.types.js';

describe('RealtimeAuthenticationService', () => {
  const tokenService = {
    verifyAccessToken: vi.fn(),
  } satisfies Pick<TokenService, 'verifyAccessToken'>;

  const logger = {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } satisfies Pick<StructuredLoggerService, 'log' | 'warn' | 'error'>;

  const service = new RealtimeAuthenticationService(
    tokenService as unknown as TokenService,
    logger as unknown as StructuredLoggerService,
  );

  it('returns the user id and request id for a valid handshake token', () => {
    vi.mocked(tokenService.verifyAccessToken).mockReturnValue({
      sub: 'user-1',
      role: 'USER',
      type: 'access',
    });

    const socket = {
      handshake: { auth: { token: 'access-token' }, headers: {} },
    } as unknown as AuthenticatedSocket;

    expect(service.authenticateSocket(socket, 'req-ws')).toEqual({
      userId: 'user-1',
      requestId: 'req-ws',
    });
  });

  it('logs handshake failures without the token material', () => {
    vi.mocked(tokenService.verifyAccessToken).mockImplementation(() => {
      throw new TokenVerificationError('TOKEN_EXPIRED', 'expired');
    });

    const socket = {
      handshake: { auth: { token: 'expired-jwt-value' }, headers: {} },
    } as unknown as AuthenticatedSocket;

    try {
      service.authenticateSocket(socket, 'req-ws');
    } catch (error) {
      expect((error as Error).message).toBe('Access token has expired.');
      expect((error as Error & { data: { code: string } }).data.code).toBe(
        AUTH_ERROR_CODES.TOKEN_EXPIRED,
      );
    }

    expect(logger.warn).toHaveBeenCalledWith(
      'auth.failure',
      expect.objectContaining({
        reason: 'token_expired',
        transport: 'websocket',
      }),
    );
    const lastFailure: unknown = logger.warn.mock.calls.at(-1)?.[1];
    expect(JSON.stringify(lastFailure)).not.toContain('expired-jwt-value');
  });

  it('logs missing handshake tokens as unauthorized', () => {
    const socket = {
      handshake: { auth: {}, headers: {} },
    } as unknown as AuthenticatedSocket;

    expect(() => service.authenticateSocket(socket, 'req-ws')).toThrow();
    expect(logger.warn).toHaveBeenCalledWith(
      'auth.failure',
      expect.objectContaining({
        reason: 'missing_token',
        code: API_ERROR_CODES.UNAUTHORIZED,
      }),
    );
  });
});
