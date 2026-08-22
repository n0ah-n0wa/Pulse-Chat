const DEFAULT_AFTER_LOGIN_PATH = '/app';

/**
 * Allows only same-origin relative paths after login.
 *
 * Protocol-relative values such as `//evil.example` would otherwise become
 * an open redirect when passed to React Router `navigate`.
 */
export function safeInternalPath(path: string | undefined): string {
  if (path === undefined || path.length === 0) {
    return DEFAULT_AFTER_LOGIN_PATH;
  }

  if (!path.startsWith('/')) {
    return DEFAULT_AFTER_LOGIN_PATH;
  }

  if (path.startsWith('//') || path.startsWith('/\\')) {
    return DEFAULT_AFTER_LOGIN_PATH;
  }

  if (path.includes('\\') || path.includes('://')) {
    return DEFAULT_AFTER_LOGIN_PATH;
  }

  return path;
}
