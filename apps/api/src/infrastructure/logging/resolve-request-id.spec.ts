import { describe, expect, it } from 'vitest';

import { resolveIncomingRequestId } from './resolve-request-id.js';

describe('resolveIncomingRequestId', () => {
  it('accepts a printable client correlation id', () => {
    expect(resolveIncomingRequestId('abc-123')).toBe('abc-123');
  });

  it('uses the first value when the header is repeated', () => {
    expect(resolveIncomingRequestId(['first', 'second'])).toBe('first');
  });

  it('generates a UUID when the header is missing or unsafe', () => {
    expect(resolveIncomingRequestId(undefined)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(resolveIncomingRequestId('has space')).not.toBe('has space');
    expect(resolveIncomingRequestId('a\nb')).not.toBe('a\nb');
    expect(resolveIncomingRequestId('x'.repeat(200))).toHaveLength(36);
  });
});
