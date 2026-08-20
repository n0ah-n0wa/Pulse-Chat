import { describe, expect, it } from 'vitest';

import { buildSearchMatchingContext } from './search-matching-context.js';

describe('buildSearchMatchingContext', () => {
  it('centers the snippet around the first case-insensitive match', () => {
    const content = 'Before the deployment finished, we celebrated.';
    expect(buildSearchMatchingContext(content, 'Deployment')).toBe(
      'Before the deployment finished, we celebrated.',
    );
  });

  it('falls back to a truncated excerpt when the query does not appear literally', () => {
    const content = 'a'.repeat(200);
    expect(buildSearchMatchingContext(content, 'missing')).toHaveLength(123);
    expect(buildSearchMatchingContext(content, 'missing')).toMatch(/\.\.\.$/);
  });
});
