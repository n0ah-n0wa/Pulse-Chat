export const REDACTED_LOG_VALUE = '[REDACTED]';

const SENSITIVE_NORMALIZED_KEYS = new Set([
  'password',
  'passwordhash',
  'passwd',
  'secret',
  'clientsecret',
  'authorization',
  'cookie',
  'cookies',
  'jwt',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'bearertoken',
  'email',
  'content',
  'mongodburi',
  'redisurl',
  'databaseurl',
]);

const CONNECTION_STRING_PATTERN = /(?:mongodb(?:\+srv)?|rediss?):\/\/\S+/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const BEARER_PATTERN = /Bearer\s+\S+/gi;
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

function normalizeLogKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, '');
}

export function isSensitiveLogKey(key: string): boolean {
  const normalized = normalizeLogKey(key);
  if (SENSITIVE_NORMALIZED_KEYS.has(normalized)) {
    return true;
  }

  return (
    normalized.includes('password') ||
    normalized.includes('passwd') ||
    normalized.includes('secret') ||
    (normalized.includes('token') && !normalized.includes('requestid'))
  );
}

export function sanitizeLogString(value: string): string {
  return value
    .replace(CONNECTION_STRING_PATTERN, '[REDACTED_URI]')
    .replace(BEARER_PATTERN, 'Bearer [REDACTED]')
    .replace(JWT_PATTERN, REDACTED_LOG_VALUE)
    .replace(EMAIL_PATTERN, '[REDACTED_EMAIL]');
}

/**
 * JSON.stringify replacer that strips secrets, tokens, and obvious PII before
 * a log line is written.
 */
export function sanitizeLogReplacer(key: string, value: unknown): unknown {
  if (key !== '' && isSensitiveLogKey(key)) {
    return REDACTED_LOG_VALUE;
  }

  if (typeof value === 'string') {
    return sanitizeLogString(value);
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeLogString(value.message),
      stack: value.stack === undefined ? undefined : sanitizeLogString(value.stack),
    };
  }

  return value;
}
