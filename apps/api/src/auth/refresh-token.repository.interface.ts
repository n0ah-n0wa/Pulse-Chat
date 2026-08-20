/** Persisted refresh-token session metadata (raw tokens are never stored). */
export interface RefreshTokenRecord {
  readonly jti: string;
  readonly userId: string;
  readonly familyId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly revokedAt?: Date;
}

export interface CreateRefreshTokenRecordInput {
  readonly jti: string;
  readonly userId: string;
  readonly familyId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

/** Data-access contract for refresh-token sessions. */
export interface RefreshTokenRepository {
  create(input: CreateRefreshTokenRecordInput): Promise<RefreshTokenRecord>;
  findByJti(jti: string): Promise<RefreshTokenRecord | null>;
  /**
   * Atomically revokes an unexpired, unrevoked session and returns the previous
   * record. Returns `null` when the token is missing, expired, or already revoked.
   */
  claimActiveByJti(jti: string, revokedAt?: Date): Promise<RefreshTokenRecord | null>;
  revokeByJti(jti: string, revokedAt?: Date): Promise<void>;
  revokeFamily(familyId: string, revokedAt?: Date): Promise<void>;
}

export const REFRESH_TOKEN_REPOSITORY = Symbol('REFRESH_TOKEN_REPOSITORY');
