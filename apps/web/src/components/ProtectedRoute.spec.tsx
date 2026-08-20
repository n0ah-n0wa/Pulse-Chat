import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ProtectedRoute } from './ProtectedRoute';
import { GuestRoute } from './GuestRoute';
import { LoginPage } from '../pages/LoginPage';
import { useAuthStore } from '../store/auth-store';

describe('ProtectedRoute', () => {
  it('redirects anonymous visitors to login', () => {
    useAuthStore.getState().clearSession();

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const router = createMemoryRouter(
      [
        {
          path: '/login',
          element: (
            <QueryClientProvider client={queryClient}>
              <GuestRoute />
            </QueryClientProvider>
          ),
          children: [
            {
              index: true,
              element: <LoginPage />,
            },
          ],
        },
        {
          path: '/app',
          element: (
            <QueryClientProvider client={queryClient}>
              <ProtectedRoute />
            </QueryClientProvider>
          ),
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
