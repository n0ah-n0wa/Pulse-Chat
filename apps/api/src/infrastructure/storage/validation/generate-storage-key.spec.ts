import { describe, expect, it } from 'vitest';

import { generateStorageKey, STORAGE_KEY_PATTERN } from './generate-storage-key.js';

describe('generateStorageKey', () => {
  it('creates a uuid-based key with an extension derived from MIME type', () => {
    const key = generateStorageKey('image/png');

    expect(STORAGE_KEY_PATTERN.test(key)).toBe(true);
    expect(key.endsWith('.png')).toBe(true);
  });
});
