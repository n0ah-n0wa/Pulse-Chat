import { describe, expect, it } from 'vitest';

import { REDACTED_LOG_VALUE, sanitizeLogReplacer } from './sanitize-log-fields.js';

describe('sanitizeLogReplacer', () => {
  it('redacts password, token, and email keys', () => {
    expect(sanitizeLogReplacer('password', 'hunter2')).toBe(REDACTED_LOG_VALUE);
    expect(sanitizeLogReplacer('refreshToken', 'opaque-refresh')).toBe(REDACTED_LOG_VALUE);
    expect(sanitizeLogReplacer('authorization', 'Bearer abc')).toBe(REDACTED_LOG_VALUE);
    expect(sanitizeLogReplacer('email', 'alex@example.com')).toBe(REDACTED_LOG_VALUE);
    expect(sanitizeLogReplacer('content', 'hello there')).toBe(REDACTED_LOG_VALUE);
  });

  it('redacts JWTs, bearer tokens, emails, and database URIs inside strings', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0In0.signaturexx';
    expect(sanitizeLogReplacer('message', `token=${jwt}`)).not.toContain('eyJ');
    expect(sanitizeLogReplacer('message', 'Authorization: Bearer super-secret')).toBe(
      'Authorization: Bearer [REDACTED]',
    );
    expect(sanitizeLogReplacer('message', 'user alex@example.com failed')).toContain(
      '[REDACTED_EMAIL]',
    );
    expect(
      sanitizeLogReplacer('message', 'Failed to connect to mongodb://user:pass@localhost:27017/db'),
    ).toBe('Failed to connect to [REDACTED_URI]');
    expect(sanitizeLogReplacer('message', 'redis://:hunter2@redis:6379')).toBe('[REDACTED_URI]');
  });

  it('redacts Error messages that include connection strings', () => {
    const error = new Error('connect ECONNREFUSED redis://:secret@127.0.0.1:6379');
    const sanitized = sanitizeLogReplacer('error', error) as {
      name: string;
      message: string;
    };

    expect(sanitized.name).toBe('Error');
    expect(sanitized.message).toBe('connect ECONNREFUSED [REDACTED_URI]');
    expect(sanitized.message).not.toContain('secret');
  });

  it('leaves correlation and identity keys intact', () => {
    expect(sanitizeLogReplacer('requestId', 'req-1')).toBe('req-1');
    expect(sanitizeLogReplacer('userId', 'user-1')).toBe('user-1');
    expect(sanitizeLogReplacer('roomId', 'room-1')).toBe('room-1');
    expect(sanitizeLogReplacer('event', 'http.request')).toBe('http.request');
  });
});
