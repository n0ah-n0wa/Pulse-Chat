import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ThemeToggle } from './ThemeToggle';
import { THEME_PREFERENCES, useThemeStore } from '../../store/theme-store';

describe('ThemeToggle', () => {
  it('updates the persisted theme preference', async () => {
    useThemeStore.setState({ preference: THEME_PREFERENCES.SYSTEM });
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole('button', { name: 'Dark' }));

    expect(useThemeStore.getState().preference).toBe(THEME_PREFERENCES.DARK);
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
  });
});
