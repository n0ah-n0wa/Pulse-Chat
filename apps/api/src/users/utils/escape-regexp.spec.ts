import { describe, expect, it } from 'vitest';

import { escapeRegExp } from './escape-regexp.js';

describe('escapeRegExp', () => {
  it('treats regex metacharacters as literals', () => {
    expect(escapeRegExp('a.b+c?')).toBe('a\\.b\\+c\\?');
    expect(new RegExp(escapeRegExp('user.name')).test('userXname')).toBe(false);
    expect(new RegExp(escapeRegExp('user.name')).test('user.name')).toBe(true);
  });
});
