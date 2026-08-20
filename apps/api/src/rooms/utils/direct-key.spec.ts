import { describe, expect, it } from 'vitest';

import { buildDirectKey } from './direct-key.js';

describe('buildDirectKey', () => {
  it('is independent of argument order', () => {
    expect(buildDirectKey('aaa', 'bbb')).toBe(buildDirectKey('bbb', 'aaa'));
  });
});
