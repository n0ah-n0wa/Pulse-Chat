export type AuthRateLimitAction = 'login' | 'register';

/** Builds the Redis key for a login or registration rate-limit window. */
export function authRateLimitKey(action: AuthRateLimitAction, ip: string): string {
  return `rate-limit:auth:${action}:${ip}`;
}

/** Maps an HTTP path to the authentication action being rate-limited. */
export function resolveAuthRateLimitAction(path: string): AuthRateLimitAction | undefined {
  if (path.endsWith('/auth/login')) {
    return 'login';
  }

  if (path.endsWith('/auth/register')) {
    return 'register';
  }

  return undefined;
}
