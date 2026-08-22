import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, type InitialEntry } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { AUTH_ERROR_CODES, TOKEN_TYPE } from '@pulse-chat/shared';

import { LoginPage } from './LoginPage';
import { RegisterPage } from './RegisterPage';
import { GuestRoute } from '../components/GuestRoute';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { useAuthStore } from '../store/auth-store';

function renderAuthRoute(initialEntry: InitialEntry, page: 'login' | 'register') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const Page = page === 'login' ? LoginPage : RegisterPage;
  const router = createMemoryRouter(
    [
      {
        path: '/app',
        element: <ProtectedRoute />,
        children: [{ index: true, element: <h1>Protected workspace</h1> }],
      },
      {
        element: <GuestRoute />,
        children: [{ path: `/${page}`, element: <Page /> }],
      },
    ],
    { initialEntries: [initialEntry] },
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    useAuthStore.getState().clearSession();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows validation errors for an empty submit', async () => {
    const user = userEvent.setup();
    renderAuthRoute('/login', 'login');

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Password is required')).toBeInTheDocument();
  });

  it('stores the session and redirects after a successful login', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
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
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    renderAuthRoute('/login', 'login');

    await user.type(screen.getByLabelText('Email'), 'alice@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated()).toBe(true);
    });
    expect(screen.getByRole('heading', { name: 'Protected workspace' })).toBeInTheDocument();
  });

  it('ignores protocol-relative post-login redirects', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
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
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    renderAuthRoute({ pathname: '/login', state: { from: '//evil.example' } }, 'login');

    await user.type(screen.getByLabelText('Email'), 'alice@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Protected workspace' })).toBeInTheDocument();
  });

  it('shows API errors from failed login attempts', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          statusCode: 401,
          code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
          message: 'Invalid email or password.',
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    renderAuthRoute('/login', 'login');

    await user.type(screen.getByLabelText('Email'), 'alice@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
  });
});

describe('RegisterPage', () => {
  beforeEach(() => {
    useAuthStore.getState().clearSession();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('validates required fields using the shared schema', async () => {
    const user = userEvent.setup();
    renderAuthRoute('/register', 'register');

    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText(`Username must be at least 3 characters`)).toBeInTheDocument();
  });

  it('registers a user and redirects to the protected workspace', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
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
        }),
        {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    renderAuthRoute('/register', 'register');

    await user.type(screen.getByLabelText('Username'), 'alice');
    await user.type(screen.getByLabelText('Display name'), 'Alice');
    await user.type(screen.getByLabelText('Email'), 'alice@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated()).toBe(true);
    });
    expect(screen.getByRole('heading', { name: 'Protected workspace' })).toBeInTheDocument();
  });
});
