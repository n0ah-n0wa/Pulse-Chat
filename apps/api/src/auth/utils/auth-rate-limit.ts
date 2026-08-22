import type { AuthRateLimitAction } from '../../rate-limit/rate-limit.keys.js';

/** Maps an HTTP path to the authentication action being rate-limited. */
export function resolveAuthRateLimitAction(path: string): AuthRateLimitAction | undefined {
  if (path.endsWith('/auth/login')) {
    return 'login';
  }

  if (path.endsWith('/auth/register')) {
    return 'register';
  }

  if (path.endsWith('/auth/refresh')) {
    return 'refresh';
  }

  if (path.endsWith('/auth/logout')) {
    return 'logout';
  }

  return undefined;
}
