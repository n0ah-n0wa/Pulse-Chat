import { describe, expect, it } from 'vitest';

import { safeInternalPath } from './safe-internal-path';

describe('safeInternalPath', () => {
  it('keeps ordinary application routes', () => {
    expect(safeInternalPath('/app')).toBe('/app');
    expect(safeInternalPath('/app/rooms/abc')).toBe('/app/rooms/abc');
  });

  it('rejects protocol-relative and absolute URLs', () => {
    expect(safeInternalPath('//evil.example')).toBe('/app');
    expect(safeInternalPath('https://evil.example')).toBe('/app');
    expect(safeInternalPath('/\\evil.example')).toBe('/app');
  });

  it('falls back when the value is missing', () => {
    expect(safeInternalPath(undefined)).toBe('/app');
    expect(safeInternalPath('')).toBe('/app');
    expect(safeInternalPath('app')).toBe('/app');
  });
});
