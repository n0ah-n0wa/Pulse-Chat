import { describe, expect, it } from 'vitest';

import { sanitizeTextSearchQuery } from './sanitize-text-search-query.js';

describe('sanitizeTextSearchQuery', () => {
  it('wraps tokens in quotes so text-search operators are literal', () => {
    expect(sanitizeTextSearchQuery('deploy-ment "quoted"')).toBe('"deploy-ment" "quoted"');
  });

  it('collapses whitespace and strips syntax-breaking characters', () => {
    expect(sanitizeTextSearchQuery('  hello   world  ')).toBe('"hello" "world"');
    expect(sanitizeTextSearchQuery('cost \\ $100')).toBe('"cost" "$100"');
  });

  it('returns an empty string when nothing searchable remains', () => {
    expect(sanitizeTextSearchQuery('   ')).toBe('');
    expect(sanitizeTextSearchQuery('"\\')).toBe('');
  });
});
