import { describe, expect, it } from 'vitest';

import { resolveColorScheme, THEME_PREFERENCES } from './theme-store';

describe('resolveColorScheme', () => {
  it('follows the system preference', () => {
    expect(resolveColorScheme(THEME_PREFERENCES.SYSTEM, true)).toBe('dark');
    expect(resolveColorScheme(THEME_PREFERENCES.SYSTEM, false)).toBe('light');
  });

  it('honours an explicit dark preference', () => {
    expect(resolveColorScheme(THEME_PREFERENCES.DARK, false)).toBe('dark');
  });
});
