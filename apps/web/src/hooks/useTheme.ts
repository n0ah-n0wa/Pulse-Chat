import { useEffect } from 'react';

import {
  applyColorScheme,
  resolveColorScheme,
  useThemeStore,
  type ThemePreference,
} from '../store/theme-store';

function prefersDarkScheme(): boolean {
  return globalThis.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyThemePreference(preference: ThemePreference): void {
  applyColorScheme(resolveColorScheme(preference, prefersDarkScheme()));
}

/** Keeps the document color scheme aligned with the persisted theme preference. */
export function useThemeSync(): void {
  const preference = useThemeStore((state) => state.preference);

  useEffect(() => {
    applyThemePreference(preference);

    const media = globalThis.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (): void => {
      applyThemePreference(preference);
    };

    media.addEventListener('change', handleChange);
    return () => {
      media.removeEventListener('change', handleChange);
    };
  }, [preference]);
}

export function useTheme() {
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);

  return { preference, setPreference };
}
