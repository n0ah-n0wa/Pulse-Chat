import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

/** Creates a SHA-256 hex digest of a refresh token for storage. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Compares a stored refresh-token hash to the hash of a presented token in
 * constant time. Returns false when the stored value is not a SHA-256 hex digest.
 */
export function refreshTokenHashEquals(storedHash: string, presentedToken: string): boolean {
  const stored = Buffer.from(storedHash, 'hex');
  const presented = Buffer.from(hashRefreshToken(presentedToken), 'hex');

  if (stored.length === 0 || stored.length !== presented.length) {
    return false;
  }

  return timingSafeEqual(stored, presented);
}

/** Generates a new refresh-token family identifier. */
export function createTokenFamilyId(): string {
  return randomUUID();
}

/** Generates a unique JWT ID for a refresh token session. */
export function createRefreshTokenJti(): string {
  return randomUUID();
}
