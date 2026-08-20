import type { Request } from 'express';

/** Normalises IPv4-mapped IPv6 addresses so rate-limit keys stay stable. */
export function normalizeClientIp(ip: string): string {
  return ip.replace(/^::ffff:/, '');
}

/** Returns the client IP used for authentication rate limiting. */
export function resolveClientIp(request: Request): string {
  const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';
  return normalizeClientIp(ip);
}
