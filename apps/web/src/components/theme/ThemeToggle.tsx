import { THEME_PREFERENCES, type ThemePreference } from '../../store/theme-store';
import { useTheme } from '../../hooks/useTheme';

const OPTIONS: readonly { readonly value: ThemePreference; readonly label: string }[] = [
  { value: THEME_PREFERENCES.LIGHT, label: 'Light' },
  { value: THEME_PREFERENCES.DARK, label: 'Dark' },
  { value: THEME_PREFERENCES.SYSTEM, label: 'System' },
];

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="group"
      aria-label="Color theme"
      className="inline-flex rounded-md border border-slate-300 p-0.5 dark:border-slate-700"
    >
      {OPTIONS.map((option) => {
        const selected = preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => {
              setPreference(option.value);
            }}
            className={
              selected
                ? 'rounded px-2.5 py-1 text-xs font-medium bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'rounded px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
