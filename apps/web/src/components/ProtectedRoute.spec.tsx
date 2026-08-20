import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ProtectedRoute } from './ProtectedRoute';
import { LoginPage } from '../pages/LoginPage';
import { useAuthStore } from '../store/auth-store';

describe('ProtectedRoute', () => {
  it('redirects anonymous visitors to login', () => {
    useAuthStore.getState().clearSession();

    const router = createMemoryRouter(
      [
        {
          path: '/login',
          element: <LoginPage />,
        },
        {
          path: '/app',
          element: <ProtectedRoute />,
          children: [
            {
              index: true,
              element: <p>Protected content</p>,
            },
          ],
        },
      ],
      { initialEntries: ['/app'] },
    );

    render(<RouterProvider router={router} />);

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});
