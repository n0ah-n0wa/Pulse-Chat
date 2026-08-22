import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TOKEN_TYPE } from '@pulse-chat/shared';

import { GuestRoute } from '../components/GuestRoute';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { LoginPage } from './LoginPage';
import { useAuthStore } from '../store/auth-store';
import { SettingsPage } from './SettingsPage';
import { THEME_PREFERENCES, useThemeStore } from '../store/theme-store';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

function renderSettings() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        element: <ProtectedRoute />,
        children: [{ path: '/settings', element: <SettingsPage /> }],
      },
      {
        element: <GuestRoute />,
        children: [{ path: '/login', element: <LoginPage /> }],
      },
    ],
    { initialEntries: ['/settings'] },
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('SettingsPage', () => {
  beforeEach(() => {
    useThemeStore.setState({ preference: THEME_PREFERENCES.SYSTEM });
    useAuthStore.getState().setSession({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      accessTokenExpiresIn: 900,
      tokenType: TOKEN_TYPE,
      user: {
        id: '507f1f77bcf86cd799439011',
        username: 'alice',
        displayName: 'Alice',
        email: 'alice@example.com',
        bio: 'Hello',
        role: 'USER',
        createdAt: '2026-08-18T00:00:00.000Z',
        updatedAt: '2026-08-18T00:00:00.000Z',
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().clearSession();
  });

  it('validates profile fields before submitting', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        id: '507f1f77bcf86cd799439011',
        username: 'alice',
        displayName: 'Alice',
        email: 'alice@example.com',
        bio: 'Hello',
        role: 'USER',
        createdAt: '2026-08-18T00:00:00.000Z',
        updatedAt: '2026-08-18T00:00:00.000Z',
      }),
    );

    renderSettings();

    const username = await screen.findByLabelText('Username');
    await user.clear(username);
    await user.type(username, 'ab');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(await screen.findByText(/at least 3/i)).toBeInTheDocument();
  });

  it('saves display name, username, and bio', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = requestUrl(input);
      const method = init?.method ?? 'GET';

      if (url.includes('/api/auth/me') && method === 'GET') {
        return Promise.resolve(
          jsonResponse({
            id: '507f1f77bcf86cd799439011',
            username: 'alice',
            displayName: 'Alice',
            email: 'alice@example.com',
            bio: 'Hello',
            role: 'USER',
            createdAt: '2026-08-18T00:00:00.000Z',
            updatedAt: '2026-08-18T00:00:00.000Z',
          }),
        );
      }

      if (url.includes('/api/users/me') && method === 'PATCH') {
        return Promise.resolve(
          jsonResponse({
            id: '507f1f77bcf86cd799439011',
            username: 'alice_new',
            displayName: 'Alice Updated',
            email: 'alice@example.com',
            bio: 'Updated bio',
            role: 'USER',
            createdAt: '2026-08-18T00:00:00.000Z',
            updatedAt: '2026-08-18T00:00:00.000Z',
          }),
        );
      }

      return Promise.resolve(
        jsonResponse({ statusCode: 404, code: 'NOT_FOUND', message: 'Missing' }, 404),
      );
    });

    renderSettings();

    const displayName = await screen.findByLabelText('Display name');
    await user.clear(displayName);
    await user.type(displayName, 'Alice Updated');
    const username = screen.getByLabelText('Username');
    await user.clear(username);
    await user.type(username, 'alice_new');
    const bio = screen.getByLabelText('Bio');
    await user.clear(bio);
    await user.type(bio, 'Updated bio');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Profile saved.');
    expect(useAuthStore.getState().user?.username).toBe('alice_new');
    expect(useAuthStore.getState().user?.displayName).toBe('Alice Updated');
  });

  it('shows email only in account settings and supports theme plus logout', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = requestUrl(input);
      const method = init?.method ?? 'GET';

      if (url.includes('/api/auth/me')) {
        return Promise.resolve(
          jsonResponse({
            id: '507f1f77bcf86cd799439011',
            username: 'alice',
            displayName: 'Alice',
            email: 'alice@example.com',
            role: 'USER',
            createdAt: '2026-08-18T00:00:00.000Z',
            updatedAt: '2026-08-18T00:00:00.000Z',
          }),
        );
      }

      if (url.includes('/api/auth/logout') && method === 'POST') {
        return Promise.resolve(new Response(null, { status: 204 }));
      }

      return Promise.resolve(
        jsonResponse({ statusCode: 404, code: 'NOT_FOUND', message: 'Missing' }, 404),
      );
    });

    renderSettings();

    expect(await screen.findByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View your profile' })).toHaveAttribute(
      'href',
      '/profile/alice',
    );

    await user.click(screen.getByRole('button', { name: 'Dark' }));
    expect(useThemeStore.getState().preference).toBe(THEME_PREFERENCES.DARK);

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated()).toBe(false);
    });
  });
});
