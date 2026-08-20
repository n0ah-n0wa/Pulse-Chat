import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import { API_ERROR_CODES, AUTH_ERROR_CODES, PASSWORD_MIN_LENGTH } from '@pulse-chat/shared';

import { AppModule } from '../app.module.js';
import { configureApplication } from '../bootstrap/configure-application.js';
import { AppConfigService } from '../config/index.js';
import { RedisService } from '../infrastructure/redis/redis.service.js';
import {
  bearerAuthorization,
  registerTestUser,
  signExpiredAccessToken,
  signExpiredRefreshToken,
} from '../test/auth-test.helpers.js';
import { startMongoMemoryServer, stopMongoMemoryServer } from '../test/mongo-memory.js';
import { TestRedisService } from '../test/test-redis.service.js';
import { authRateLimitKey } from './utils/auth-rate-limit.js';

describe('AuthController', () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  let httpServer: Server;

  beforeAll(async () => {
    process.env['MONGODB_URI'] = await startMongoMemoryServer();

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RedisService)
      .useClass(TestRedisService)
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApplication(app, app.get(AppConfigService));
    await app.init();
    httpServer = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app?.close();
    await moduleRef?.close();
    await stopMongoMemoryServer();
  });

  it('registers a user successfully', async () => {
    const session = await registerTestUser(httpServer, {
      username: 'register_ok',
      email: 'register_ok@example.com',
      displayName: 'Registered User',
    });

    expect(session.accessToken.length).toBeGreaterThan(0);
    expect(session.refreshToken.length).toBeGreaterThan(0);
  });

  it('rejects duplicate email on registration', async () => {
    await registerTestUser(httpServer, {
      username: 'first_user',
      email: 'duplicate@example.com',
    });

    const response = await request(httpServer)
      .post('/api/auth/register')
      .send({
        username: 'second_user',
        email: 'duplicate@example.com',
        password: 'secure-password',
        displayName: 'Second User',
      })
      .expect(409);

    expect(response.body).toMatchObject({
      code: AUTH_ERROR_CODES.EMAIL_ALREADY_REGISTERED,
    });
  });

  it('rejects duplicate username on registration', async () => {
    await registerTestUser(httpServer, {
      username: 'taken_name',
      email: 'first@example.com',
    });

    const response = await request(httpServer)
      .post('/api/auth/register')
      .send({
        username: 'taken_name',
        email: 'second@example.com',
        password: 'secure-password',
        displayName: 'Second User',
      })
      .expect(409);

    expect(response.body).toMatchObject({
      code: AUTH_ERROR_CODES.USERNAME_ALREADY_TAKEN,
    });
  });

  it('rejects invalid passwords on registration', async () => {
    const response = await request(httpServer)
      .post('/api/auth/register')
      .send({
        username: 'weak_pass',
        email: 'weak_pass@example.com',
        password: 'a'.repeat(PASSWORD_MIN_LENGTH - 1),
        displayName: 'Weak Password',
      })
      .expect(400);

    expect(response.body).toMatchObject({
      code: API_ERROR_CODES.VALIDATION_FAILED,
    });
  });

  it('logs in with valid credentials', async () => {
    await registerTestUser(httpServer, {
      username: 'login_user',
      email: 'login_user@example.com',
      password: 'secure-password',
    });

    const response = await request(httpServer)
      .post('/api/auth/login')
      .send({
        email: 'login_user@example.com',
        password: 'secure-password',
      })
      .expect(200);

    expect(response.body).toMatchObject({
      tokenType: 'Bearer',
      user: {
        email: 'login_user@example.com',
        username: 'login_user',
      },
    });
    expect(response.body).not.toHaveProperty('passwordHash');
  });

  it('rejects invalid credentials', async () => {
    await registerTestUser(httpServer, {
      username: 'invalid_login',
      email: 'invalid_login@example.com',
    });

    const response = await request(httpServer)
      .post('/api/auth/login')
      .send({
        email: 'invalid_login@example.com',
        password: 'wrong-password',
      })
      .expect(401);

    expect(response.body).toMatchObject({
      code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
    });
  });

  it('rejects unknown emails with the same error as a wrong password', async () => {
    const response = await request(httpServer)
      .post('/api/auth/login')
      .send({
        email: 'missing-user@example.com',
        password: 'secure-password',
      })
      .expect(401);

    expect(response.body).toMatchObject({
      code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
    });
    expect(JSON.stringify(response.body)).not.toContain('secure-password');
  });

  it('rejects expired access tokens', async () => {
    const session = await registerTestUser(httpServer, {
      username: 'expired_access',
      email: 'expired_access@example.com',
    });

    const expiredToken = signExpiredAccessToken(app, session.userId);

    const response = await request(httpServer)
      .get('/api/auth/me')
      .set(bearerAuthorization(expiredToken))
      .expect(401);

    expect(response.body).toMatchObject({
      code: AUTH_ERROR_CODES.TOKEN_EXPIRED,
    });
  });

  it('refreshes tokens and rotates the refresh token', async () => {
    const session = await registerTestUser(httpServer, {
      username: 'refresh_user',
      email: 'refresh_user@example.com',
    });

    const refreshed = await request(httpServer)
      .post('/api/auth/refresh')
      .send({ refreshToken: session.refreshToken })
      .expect(200);

    const refreshedBody = refreshed.body as {
      accessToken: string;
      refreshToken: string;
    };

    expect(refreshedBody.refreshToken).not.toBe(session.refreshToken);
    expect(refreshedBody.accessToken.length).toBeGreaterThan(0);

    await request(httpServer)
      .post('/api/auth/refresh')
      .send({ refreshToken: session.refreshToken })
      .expect(401);
  });

  it('rejects expired refresh tokens', async () => {
    const session = await registerTestUser(httpServer, {
      username: 'expired_refresh',
      email: 'expired_refresh@example.com',
    });

    const expired = signExpiredRefreshToken(app, session.userId, 'expired-jti', 'expired-family');

    const response = await request(httpServer)
      .post('/api/auth/refresh')
      .send({ refreshToken: expired })
      .expect(401);

    expect(response.body).toMatchObject({
      code: AUTH_ERROR_CODES.TOKEN_EXPIRED,
    });
  });

  it('revokes refresh tokens on logout', async () => {
    const session = await registerTestUser(httpServer, {
      username: 'logout_user',
      email: 'logout_user@example.com',
    });

    await request(httpServer)
      .post('/api/auth/logout')
      .send({ refreshToken: session.refreshToken })
      .expect(204);

    await request(httpServer)
      .post('/api/auth/refresh')
      .send({ refreshToken: session.refreshToken })
      .expect(401);
  });

  it('returns the current user profile for authorized requests', async () => {
    const session = await registerTestUser(httpServer, {
      username: 'me_user',
      email: 'me_user@example.com',
      displayName: 'Me User',
    });

    const response = await request(httpServer)
      .get('/api/auth/me')
      .set(bearerAuthorization(session.accessToken))
      .expect(200);

    expect(response.body).toMatchObject({
      id: session.userId,
      email: 'me_user@example.com',
      username: 'me_user',
      displayName: 'Me User',
    });
    expect(response.body).not.toHaveProperty('passwordHash');
  });

  it('rejects unauthorized requests to protected endpoints', async () => {
    const response = await request(httpServer).get('/api/auth/me').expect(401);

    expect(response.body).toMatchObject({
      code: API_ERROR_CODES.UNAUTHORIZED,
    });
  });

  it('rejects an access token used as a refresh token', async () => {
    const session = await registerTestUser(httpServer, {
      username: 'access_as_refresh',
      email: 'access_as_refresh@example.com',
    });

    const response = await request(httpServer)
      .post('/api/auth/refresh')
      .send({ refreshToken: session.accessToken })
      .expect(401);

    expect(response.body).toMatchObject({
      code: AUTH_ERROR_CODES.INVALID_REFRESH_TOKEN,
    });
    expect(JSON.stringify(response.body)).not.toContain(session.accessToken);
    expect(JSON.stringify(response.body)).not.toContain(session.refreshToken);
  });

  it('returns 204 for logout with an expired refresh token', async () => {
    const expired = signExpiredRefreshToken(
      app,
      '507f1f77bcf86cd799439011',
      'expired-jti',
      'expired-family',
    );

    await request(httpServer).post('/api/auth/logout').send({ refreshToken: expired }).expect(204);
  });

  it('allows at most one concurrent refresh of the same token', async () => {
    const session = await registerTestUser(httpServer, {
      username: 'concurrent_refresh',
      email: 'concurrent_refresh@example.com',
    });

    const [first, second] = await Promise.all([
      request(httpServer).post('/api/auth/refresh').send({ refreshToken: session.refreshToken }),
      request(httpServer).post('/api/auth/refresh').send({ refreshToken: session.refreshToken }),
    ]);

    const statuses = [first.status, second.status];
    expect(statuses.filter((status) => status === 200).length).toBeLessThanOrEqual(1);
    expect(statuses).toContain(401);

    await request(httpServer)
      .post('/api/auth/refresh')
      .send({ refreshToken: session.refreshToken })
      .expect(401);
  });

  it('rate-limits login attempts per IP', async () => {
    const redis = app.get(RedisService);
    const config = app.get(AppConfigService);
    const candidateIps = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

    for (const ip of candidateIps) {
      await redis.set(
        authRateLimitKey('login', ip),
        String(config.rateLimit.login),
        config.rateLimit.authWindowSeconds,
      );
    }

    try {
      const response = await request(httpServer)
        .post('/api/auth/login')
        .send({
          email: 'rate_limit@example.com',
          password: 'secure-password',
        })
        .expect(429);

      expect(response.body).toMatchObject({
        code: API_ERROR_CODES.TOO_MANY_REQUESTS,
      });
      expect(JSON.stringify(response.body)).not.toContain('secure-password');
    } finally {
      await redis.del(...candidateIps.map((ip) => authRateLimitKey('login', ip)));
    }
  });
});
