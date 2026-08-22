import { describe, expect, it } from 'vitest';

import {
  authRateLimitKey,
  RATE_LIMIT_ACTIONS,
  rateLimitKey,
  userRateLimitKey,
} from './rate-limit.keys.js';

describe('rate-limit keys', () => {
  it('scopes login and registration counters per IP', () => {
    expect(authRateLimitKey('login', '127.0.0.1')).toBe('rate-limit:auth:login:127.0.0.1');
    expect(rateLimitKey(RATE_LIMIT_ACTIONS.REGISTER, '::1')).toBe('rate-limit:auth:register:::1');
  });

  it('scopes message, search and upload counters per user', () => {
    expect(userRateLimitKey('messages', 'user-1')).toBe('rate-limit:messages:user:user-1');
    expect(rateLimitKey(RATE_LIMIT_ACTIONS.SEARCH, 'user-1')).toBe('rate-limit:search:user:user-1');
    expect(rateLimitKey(RATE_LIMIT_ACTIONS.UPLOADS, 'user-1')).toBe(
      'rate-limit:uploads:user:user-1',
    );
    expect(rateLimitKey(RATE_LIMIT_ACTIONS.TYPING, 'user-1')).toBe('rate-limit:typing:user:user-1');
  });

  it('scopes refresh and logout counters per IP', () => {
    expect(rateLimitKey(RATE_LIMIT_ACTIONS.REFRESH, '127.0.0.1')).toBe(
      'rate-limit:auth:refresh:127.0.0.1',
    );
    expect(rateLimitKey(RATE_LIMIT_ACTIONS.LOGOUT, '10.0.0.1')).toBe(
      'rate-limit:auth:logout:10.0.0.1',
    );
  });
});
