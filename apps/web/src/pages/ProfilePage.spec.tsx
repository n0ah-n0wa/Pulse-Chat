import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TOKEN_TYPE } from '@pulse-chat/shared';

import { useAuthStore } from '../store/auth-store';
import { ProfilePage } from './ProfilePage';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderProfile(username: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter([{ path: '/profile/:username', element: <ProfilePage /> }], {
    initialEntries: [`/profile/${username}`],
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('ProfilePage', () => {
  beforeEach(() => {
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

  it('renders a public profile without email', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        id: '507f1f77bcf86cd799439012',
        username: 'bob',
        displayName: 'Bob Builder',
        bio: 'Builds things',
        role: 'USER',
        createdAt: '2026-08-18T00:00:00.000Z',
      }),
    );

    renderProfile('bob');

    expect(await screen.findByRole('heading', { name: 'Bob Builder' })).toBeInTheDocument();
    expect(screen.getByText('@bob')).toBeInTheDocument();
    expect(screen.getByText('Builds things')).toBeInTheDocument();
    expect(screen.queryByText('alice@example.com')).not.toBeInTheDocument();
    expect(screen.queryByText('bob@example.com')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit profile' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Message' })).toBeInTheDocument();
  });

  it('lets the current user open settings from their profile', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        id: '507f1f77bcf86cd799439011',
        username: 'alice',
        displayName: 'Alice',
        role: 'USER',
        createdAt: '2026-08-18T00:00:00.000Z',
      }),
    );

    renderProfile('alice');

    expect(await screen.findByRole('link', { name: 'Edit profile' })).toHaveAttribute(
      'href',
      '/settings',
    );
  });

  it('shows an error when the profile cannot be loaded', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ statusCode: 404, code: 'USER_NOT_FOUND', message: 'User not found.' }, 404),
    );

    renderProfile('missing');

    expect(await screen.findByText('Profile unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
