import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationCenter } from './NotificationCenter';
import { useAuthStore } from '../../store/auth-store';
import { useSocketStore } from '../../store/socket-store';

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

function renderCenter() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationCenter onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('NotificationCenter', () => {
  beforeEach(() => {
    useSocketStore.getState().setConnectionState('connected');
    useAuthStore.setState({
      accessToken: 'token',
      refreshToken: 'refresh',
      user: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useSocketStore.getState().resetConnectionState();
    useAuthStore.getState().clearSession();
  });

  it('marks a notification as read', async () => {
    const user = userEvent.setup();
    const notificationId = '507f1f77bcf86cd799439061';

    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = requestUrl(input);
      const method = init?.method ?? 'GET';

      if (url.includes('/api/notifications') && method === 'GET') {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                id: notificationId,
                userId: '507f1f77bcf86cd799439011',
                type: 'mention',
                referenceId: '507f1f77bcf86cd799439041',
                actorId: '507f1f77bcf86cd799439012',
                isRead: false,
                createdAt: '2026-08-18T00:00:00.000Z',
              },
            ],
          }),
        );
      }

      if (url.includes(`/api/notifications/${notificationId}/read`) && method === 'POST') {
        return Promise.resolve(
          jsonResponse({
            id: notificationId,
            userId: '507f1f77bcf86cd799439011',
            type: 'mention',
            referenceId: '507f1f77bcf86cd799439041',
            actorId: '507f1f77bcf86cd799439012',
            isRead: true,
            createdAt: '2026-08-18T00:00:00.000Z',
          }),
        );
      }

      return Promise.resolve(
        jsonResponse({ statusCode: 404, code: 'NOT_FOUND', message: 'Missing' }, 404),
      );
    });

    renderCenter();

    expect(
      await screen.findByRole('button', { name: 'Mark read' }, { timeout: 5_000 }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark read' }));

    expect(await screen.findByText('Mention')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark read' })).not.toBeInTheDocument();
  });

  it('shows offline guidance while disconnected', async () => {
    useSocketStore.getState().setConnectionState('disconnected');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ items: [] }));

    renderCenter();

    expect(
      await screen.findByText(/Offline — showing last loaded notifications/),
    ).toBeInTheDocument();
  });
});
