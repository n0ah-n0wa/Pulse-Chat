import RedisMock from 'ioredis-mock';
import { describe, expect, it } from 'vitest';

import { INCREMENT_WITH_TTL_LUA, parseIncrementWithTtlResult } from './increment-with-ttl.js';

describe('INCREMENT_WITH_TTL_LUA', () => {
  it('increments and sets TTL in a single script', async () => {
    const redis = new RedisMock();

    try {
      const first = parseIncrementWithTtlResult(
        await redis.eval(INCREMENT_WITH_TTL_LUA, 1, 'rl:test', '60'),
      );
      expect(first).toBe(1);

      const ttlAfterCreate = await redis.ttl('rl:test');
      expect(ttlAfterCreate).toBeGreaterThan(0);
      expect(ttlAfterCreate).toBeLessThanOrEqual(60);

      const second = parseIncrementWithTtlResult(
        await redis.eval(INCREMENT_WITH_TTL_LUA, 1, 'rl:test', '60'),
      );
      expect(second).toBe(2);
      expect(await redis.ttl('rl:test')).toBeGreaterThan(0);
    } finally {
      await redis.quit();
    }
  });

  it('rejects non-integer eval results', () => {
    expect(() => parseIncrementWithTtlResult('nope')).toThrow(/INCR result/);
    expect(() => parseIncrementWithTtlResult(undefined)).toThrow(/INCR result/);
  });
});
