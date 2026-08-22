import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TOKEN_TYPE } from '@pulse-chat/shared';

import { useAuthStore } from '../../store/auth-store';
import { UserActionMenu } from './UserActionMenu';

function renderMenu() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <UserActionMenu userId="507f1f77bcf86cd799439012" username="bob" displayName="Bob" />
        ),
      },
      { path: '/profile/:username', element: <p>Profile</p> },
      { path: '/app/rooms/:roomId', element: <p>Room</p> },
    ],
    { initialEntries: ['/'] },
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('UserActionMenu', () => {
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

  it('links to the user profile and offers a direct message', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('button', { name: 'Bob' }));
    expect(screen.getByRole('menuitem', { name: 'View profile' })).toHaveAttribute(
      'href',
      '/profile/bob',
    );
    expect(screen.getByRole('menuitem', { name: 'Message' })).toBeInTheDocument();
  });
});
