import type { Request } from 'express';

/** Extracts a Bearer token from the Authorization header, if present. */
export function extractBearerToken(request: Request): string | undefined {
  const header = request.headers?.authorization;

  if (typeof header !== 'string') {
    return undefined;
  }

  const [scheme, token] = header.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || token === undefined || token.trim().length === 0) {
    return undefined;
  }

  return token.trim();
}
