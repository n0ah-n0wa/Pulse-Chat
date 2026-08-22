import { describe, expect, it, vi } from 'vitest';

import { isTransientRedisError, withRedisRetry } from './redis-retry.js';

describe('isTransientRedisError', () => {
  it('recognises common reconnectable Redis failures', () => {
    expect(isTransientRedisError(new Error('ECONNRESET'))).toBe(true);
    expect(isTransientRedisError(new Error('Redis is temporarily unavailable'))).toBe(true);
    expect(isTransientRedisError(new Error('Connection is closed.'))).toBe(true);
    expect(
      isTransientRedisError(new Error("READONLY You can't write against a read only replica")),
    ).toBe(true);
    expect(isTransientRedisError(new Error('WRONGTYPE'))).toBe(false);
    expect(isTransientRedisError('not-an-error')).toBe(false);
  });
});

describe('withRedisRetry', () => {
  it('returns the first successful result', async () => {
    const operation = vi.fn().mockResolvedValue('ok');

    await expect(withRedisRetry(operation)).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries transient failures then succeeds', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('Redis is temporarily unavailable'))
      .mockRejectedValueOnce(new Error('Connection is closed.'))
      .mockResolvedValue('recovered');

    await expect(withRedisRetry(operation, { baseDelayMs: 1 })).resolves.toBe('recovered');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('does not retry permanent errors', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('WRONGTYPE Operation against a key'));

    await expect(withRedisRetry(operation, { baseDelayMs: 1 })).rejects.toThrow(/WRONGTYPE/);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
