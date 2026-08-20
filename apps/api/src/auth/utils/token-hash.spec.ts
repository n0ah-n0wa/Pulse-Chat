import { describe, expect, it } from 'vitest';

import { hashRefreshToken, refreshTokenHashEquals } from './token-hash.js';

describe('refreshTokenHashEquals', () => {
  it('accepts the original token against its stored hash', () => {
    const token = 'refresh-token-value';

    expect(refreshTokenHashEquals(hashRefreshToken(token), token)).toBe(true);
  });

  it('rejects a different token without throwing', () => {
    expect(refreshTokenHashEquals(hashRefreshToken('stored-token'), 'other-token')).toBe(false);
  });

  it('rejects a malformed stored hash', () => {
    expect(refreshTokenHashEquals('not-hex', 'refresh-token-value')).toBe(false);
  });
});
