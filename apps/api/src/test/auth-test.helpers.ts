import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';

import { ACCESS_TOKEN_TYPE, REFRESH_TOKEN_TYPE } from '../auth/token.service.js';
import { AppConfigService } from '../config/index.js';

/** Signs an already-expired access token for unauthorized-request tests. */
export function signExpiredAccessToken(app: INestApplication, userId: string): string {
  const jwtService = app.get(JwtService);
  const config = app.get(AppConfigService);

  return jwtService.sign(
    {
      sub: userId,
      role: 'USER',
      type: ACCESS_TOKEN_TYPE,
    },
    {
      secret: config.jwt.accessSecret,
      expiresIn: '-1s',
      algorithm: 'HS256',
    },
  );
}

/** Signs an already-expired refresh token for logout/refresh tests. */
export function signExpiredRefreshToken(
  app: INestApplication,
  userId: string,
  jti: string,
  familyId: string,
): string {
  const jwtService = app.get(JwtService);
  const config = app.get(AppConfigService);

  return jwtService.sign(
    {
      sub: userId,
      jti,
      familyId,
      type: REFRESH_TOKEN_TYPE,
    },
    {
      secret: config.jwt.refreshSecret,
      expiresIn: '-1s',
      algorithm: 'HS256',
    },
  );
}

/** Returns an Authorization header value for a Bearer access token. */
export function bearerAuthorization(accessToken: string): { Authorization: string } {
  return { Authorization: `Bearer ${accessToken}` };
}

/** Registers a user and returns the session payload from the API. */
export async function registerTestUser(
  httpServer: Parameters<typeof request>[0],
  overrides: Partial<{
    username: string;
    email: string;
    password: string;
    displayName: string;
  }> = {},
): Promise<{
  accessToken: string;
  refreshToken: string;
  userId: string;
}> {
  const suffix = randomUUID().slice(0, 8);
  const response = await request(httpServer)
    .post('/api/auth/register')
    .send({
      username: overrides.username ?? `user_${suffix}`,
      email: overrides.email ?? `user_${suffix}@example.com`,
      password: overrides.password ?? 'secure-password',
      displayName: overrides.displayName ?? 'Test User',
    })
    .expect(201);

  const body = response.body as {
    accessToken: string;
    refreshToken: string;
    user: { id: string };
  };

  return {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    userId: body.user.id,
  };
}
