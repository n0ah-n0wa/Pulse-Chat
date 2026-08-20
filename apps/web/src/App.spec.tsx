import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('App', () => {
  it('renders the application shell on the home route', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: 'Pulse Chat' })).toBeInTheDocument();
    expect(screen.getByText('Application foundation')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Sign in' }).length).toBeGreaterThan(0);
  });
});
