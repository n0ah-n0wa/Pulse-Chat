/**
 * Fixed-window counter: INCR and set EXPIRE only when the key is created.
 * A crash between separate INCR and EXPIRE commands would leave an unbounded key.
 */
export const INCREMENT_WITH_TTL_LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
`;

export function parseIncrementWithTtlResult(result: unknown): number {
  if (typeof result === 'number' && Number.isFinite(result)) {
    return result;
  }

  if (typeof result === 'string' && result.trim() !== '') {
    const parsed = Number(result);
    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }

  throw new Error(`Unexpected Redis INCR result: ${String(result)}`);
}
