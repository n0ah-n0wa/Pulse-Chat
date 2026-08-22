import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const THEME_PREFERENCES = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
} as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[keyof typeof THEME_PREFERENCES];

interface ThemeState {
  readonly preference: ThemePreference;
  readonly setPreference: (preference: ThemePreference) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      preference: THEME_PREFERENCES.SYSTEM,
      setPreference: (preference) => {
        set({ preference });
      },
    }),
    {
      name: 'pulse-chat-theme',
      partialize: (state) => ({ preference: state.preference }),
    },
  ),
);

export function resolveColorScheme(
  preference: ThemePreference,
  prefersDark: boolean,
): 'light' | 'dark' {
  if (preference === THEME_PREFERENCES.DARK) {
    return 'dark';
  }

  if (preference === THEME_PREFERENCES.LIGHT) {
    return 'light';
  }

  return prefersDark ? 'dark' : 'light';
}

export function applyColorScheme(scheme: 'light' | 'dark'): void {
  document.documentElement.classList.toggle('dark', scheme === 'dark');
  document.documentElement.style.colorScheme = scheme;
}
