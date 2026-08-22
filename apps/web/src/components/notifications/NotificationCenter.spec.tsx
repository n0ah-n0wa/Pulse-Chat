import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NotificationResponse } from '@pulse-chat/shared';

import { NotificationCenter } from './NotificationCenter';
import { queryKeys } from '../../lib/query-keys';
import { useAuthStore } from '../../store/auth-store';
import { useSocketStore } from '../../store/socket-store';

const NOTIFICATION_ID = '507f1f77bcf86cd799439061';
const ROOM_ID = '507f1f77bcf86cd799439021';

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

function mentionNotification(isRead: boolean): NotificationResponse {
  return {
    id: NOTIFICATION_ID,
    userId: '507f1f77bcf86cd799439011',
    type: 'mention',
    referenceId: '507f1f77bcf86cd799439041',
    roomId: ROOM_ID,
    actorId: '507f1f77bcf86cd799439012',
    isRead,
    createdAt: '2026-08-18T00:00:00.000Z',
  };
}

function renderCenter(onClose = vi.fn(), items: readonly NotificationResponse[] = []) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData(queryKeys.notifications.list(), { items });

  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <NotificationCenter onClose={onClose} />,
      },
      {
        path: '/app/rooms/:roomId',
        element: <p>Opened conversation</p>,
      },
    ],
    { initialEntries: ['/'] },
  );

  return {
    onClose,
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  };
}

describe('NotificationCenter', () => {
  beforeEach(() => {
    useSocketStore.getState().setConnectionState('connected');
    useAuthStore.setState({
      accessToken: 'token',
      refreshToken: 'refresh',
      user: null,
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = requestUrl(input);
      const method = init?.method ?? 'GET';

      if (url.includes('/api/notifications') && method === 'GET') {
        return Promise.resolve(jsonResponse({ items: [] }));
      }

      return Promise.resolve(
        jsonResponse({ statusCode: 404, code: 'NOT_FOUND', message: 'Missing' }, 404),
      );
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useSocketStore.getState().resetConnectionState();
    useAuthStore.getState().clearSession();
  });

  it('marks a notification as read without leaving the list', async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = requestUrl(input);
      const method = init?.method ?? 'GET';

      if (url.includes(`/api/notifications/${NOTIFICATION_ID}/read`) && method === 'POST') {
        return Promise.resolve(jsonResponse(mentionNotification(true)));
      }

      if (url.includes('/api/notifications') && method === 'GET') {
        return Promise.resolve(jsonResponse({ items: [mentionNotification(false)] }));
      }

      return Promise.resolve(
        jsonResponse({ statusCode: 404, code: 'NOT_FOUND', message: 'Missing' }, 404),
      );
    });

    renderCenter(vi.fn(), [mentionNotification(false)]);

    await user.click(screen.getByRole('button', { name: 'Mark read' }));

    expect(await screen.findByText('Mention')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark read' })).not.toBeInTheDocument();
    expect(screen.queryByText('Opened conversation')).not.toBeInTheDocument();
  });

  it('opens the conversation when a reply notification is selected', async () => {
    const user = userEvent.setup();
    let markedRead = false;
    const reply = { ...mentionNotification(false), type: 'reply' as const };

    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = requestUrl(input);
      const method = init?.method ?? 'GET';

      if (url.includes(`/api/notifications/${NOTIFICATION_ID}/read`) && method === 'POST') {
        markedRead = true;
        return Promise.resolve(jsonResponse({ ...reply, isRead: true }));
      }

      return Promise.resolve(
        jsonResponse({ statusCode: 404, code: 'NOT_FOUND', message: 'Missing' }, 404),
      );
    });

    const { onClose } = renderCenter(vi.fn(), [reply]);

    await user.click(screen.getByRole('link', { name: 'Open reply' }));

    expect(await screen.findByText('Opened conversation')).toBeInTheDocument();
    expect(onClose).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(markedRead).toBe(true);
    });
  });

  it('opens a private conversation from a direct-message notification', async () => {
    const user = userEvent.setup();
    const { onClose } = renderCenter(vi.fn(), [
      { ...mentionNotification(true), type: 'direct_message' },
    ]);

    await user.click(screen.getByRole('link', { name: 'Open direct message' }));

    expect(await screen.findByText('Opened conversation')).toBeInTheDocument();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows offline guidance while disconnected', () => {
    useSocketStore.getState().setConnectionState('disconnected');

    renderCenter();

    expect(screen.getByText(/Offline — showing last loaded notifications/)).toBeInTheDocument();
  });
});
