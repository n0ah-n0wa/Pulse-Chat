export const RATE_LIMIT_ACTIONS = {
  LOGIN: 'login',
  REGISTER: 'register',
  REFRESH: 'refresh',
  LOGOUT: 'logout',
  MESSAGES: 'messages',
  SEARCH: 'search',
  UPLOADS: 'uploads',
  TYPING: 'typing',
} as const;

export type RateLimitAction = (typeof RATE_LIMIT_ACTIONS)[keyof typeof RATE_LIMIT_ACTIONS];

export type AuthRateLimitAction =
  | typeof RATE_LIMIT_ACTIONS.LOGIN
  | typeof RATE_LIMIT_ACTIONS.REGISTER
  | typeof RATE_LIMIT_ACTIONS.REFRESH
  | typeof RATE_LIMIT_ACTIONS.LOGOUT;

export type UserRateLimitAction =
  | typeof RATE_LIMIT_ACTIONS.MESSAGES
  | typeof RATE_LIMIT_ACTIONS.SEARCH
  | typeof RATE_LIMIT_ACTIONS.UPLOADS
  | typeof RATE_LIMIT_ACTIONS.TYPING;

/** Redis key for a login or registration window, scoped per client IP. */
export function authRateLimitKey(action: AuthRateLimitAction, ip: string): string {
  return `rate-limit:auth:${action}:${ip}`;
}

/** Redis key for a per-user window (messages, search, uploads). */
export function userRateLimitKey(action: UserRateLimitAction, userId: string): string {
  return `rate-limit:${action}:user:${userId}`;
}

export function rateLimitKey(action: RateLimitAction, subject: string): string {
  if (
    action === RATE_LIMIT_ACTIONS.LOGIN ||
    action === RATE_LIMIT_ACTIONS.REGISTER ||
    action === RATE_LIMIT_ACTIONS.REFRESH ||
    action === RATE_LIMIT_ACTIONS.LOGOUT
  ) {
    return authRateLimitKey(action, subject);
  }

  return userRateLimitKey(action, subject);
}
