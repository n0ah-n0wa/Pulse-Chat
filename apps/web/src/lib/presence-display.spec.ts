import { describe, expect, it } from 'vitest';

import { formatLastSeen, presenceLabel } from './presence-display';

describe('presence-display', () => {
  it('labels online users', () => {
    expect(presenceLabel(true, undefined)).toBe('Online');
  });

  it('formats offline users with last seen', () => {
    const label = presenceLabel(false, '2026-08-18T12:00:00.000Z');
    expect(label).toMatch(/^Last seen /);
  });

  it('handles missing last seen', () => {
    expect(formatLastSeen(undefined)).toBe('Last seen unknown');
    expect(presenceLabel(false, undefined)).toBe('Last seen unknown');
  });
});
