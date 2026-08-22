import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { TOKEN_TYPE } from '@pulse-chat/shared';

import { AppShell } from './AppShell';
import { GuestRoute } from './GuestRoute';
import { ProtectedRoute } from './ProtectedRoute';
import { ChatHomePage } from '../pages/ChatHomePage';
import { LoginPage } from '../pages/LoginPage';
import { useAuthStore } from '../store/auth-store';

vi.mock('../services/socket-service', () => ({
  getSocketService: () => ({
    acquireConnection: vi.fn(() => () => undefined),
    acquireRoom: vi.fn(() => () => undefined),
    connect: vi.fn(),
    disconnect: vi.fn(),
    emit: vi.fn(),
    addServerListener: vi.fn(() => () => undefined),
    onReconnect: vi.fn(() => () => undefined),
    getJoinedRoomIds: vi.fn(() => []),
  }),
}));

vi.mock('../services/realtime-sync-service', () => ({
  bindRealtimeQueryClient: vi.fn(),
  startRealtimeSync: vi.fn(() => () => undefined),
}));

describe('AppShell logout', () => {
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

  it('clears the session and returns to login', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

      if (url.includes('/api/auth/logout')) {
        return Promise.resolve(new Response(null, { status: 204 }));
      }

      if (url.includes('/api/rooms')) {
        return Promise.resolve(
          new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }

      return Promise.resolve(new Response(null, { status: 204 }));
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: (
            <QueryClientProvider client={queryClient}>
              <AppShell />
            </QueryClientProvider>
          ),
          children: [
            {
              element: <ProtectedRoute />,
              children: [{ path: 'app', element: <ChatHomePage /> }],
            },
            {
              element: <GuestRoute />,
              children: [{ path: 'login', element: <LoginPage /> }],
            },
          ],
        },
      ],
      { initialEntries: ['/app'] },
    );

    render(<RouterProvider router={router} />);

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated()).toBe(false);
      expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    });
  });
});
