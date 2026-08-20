import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { TOKEN_TYPE } from '@pulse-chat/shared';

import { GuestRoute } from './GuestRoute';
import { AppHomePage } from '../pages/AppHomePage';
import { LoginPage } from '../pages/LoginPage';
import { useAuthStore } from '../store/auth-store';

describe('GuestRoute', () => {
  it('redirects authenticated users away from login', () => {
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

    const router = createMemoryRouter(
      [
        {
          path: '/app',
          element: <AppHomePage />,
        },
        {
          element: <GuestRoute />,
          children: [{ path: '/login', element: <LoginPage /> }],
        },
      ],
      { initialEntries: ['/login'] },
    );

    render(<RouterProvider router={router} />);

    expect(screen.getByRole('heading', { name: 'Protected workspace' })).toBeInTheDocument();
    useAuthStore.getState().clearSession();
  });
});
