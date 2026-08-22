import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MEMBERSHIP_ROLES, ROOM_TYPES } from '@pulse-chat/shared';

import { RoomList } from './RoomList';
import type { MessagesInfiniteData } from '../../lib/message-cache';
import { queryKeys } from '../../lib/query-keys';
import { useAuthStore } from '../../store/auth-store';
import { useRoomUiStore } from '../../store/room-ui-store';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderList(seed?: (queryClient: QueryClient) => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  seed?.(queryClient);
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <RoomList />,
      },
      {
        path: '/app/rooms/:roomId',
        element: <p>Opened</p>,
      },
    ],
    { initialEntries: ['/'] },
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('RoomList', () => {
  let settleHangingFetch: (() => void) | undefined;

  beforeEach(() => {
    useAuthStore.setState({
      accessToken: 'token',
      refreshToken: 'refresh',
      user: null,
    });
    useRoomUiStore.setState({ currentRoomId: null });
  });

  afterEach(() => {
    settleHangingFetch?.();
    settleHangingFetch = undefined;
    vi.restoreAllMocks();
    useAuthStore.getState().clearSession();
  });

  it('shows a loading state while rooms are fetched', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise((resolve) => {
          settleHangingFetch = () => {
            resolve(jsonResponse([]));
          };
        }),
    );
    renderList();
    expect(screen.getByLabelText('Loading rooms')).toBeInTheDocument();
  });

  it('shows an empty state when the user has no rooms', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse([]));
    renderList();
    expect(await screen.findByText('No rooms yet')).toBeInTheDocument();
  });

  it('shows an error state when the request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'Boom' }, 500),
    );
    renderList();
    expect(await screen.findByText('Could not load rooms')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('renders room names from the API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse([
        {
          id: '507f1f77bcf86cd799439021',
          name: 'General',
          type: ROOM_TYPES.PUBLIC,
          createdAt: '2026-08-18T00:00:00.000Z',
          updatedAt: '2026-08-18T00:00:00.000Z',
          currentUserRole: MEMBERSHIP_ROLES.MEMBER,
        },
      ]),
    );
    renderList();
    expect(await screen.findByRole('link', { name: /General/ })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Rooms' })).toHaveTextContent('Public');
    expect(screen.getByLabelText('Search rooms and people')).toBeInTheDocument();
  });

  it('shows an unread badge from history that is newer than the read cursor', async () => {
    const roomId = '507f1f77bcf86cd799439021';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse([
        {
          id: roomId,
          name: 'General',
          type: ROOM_TYPES.PUBLIC,
          createdAt: '2026-08-18T00:00:00.000Z',
          updatedAt: '2026-08-18T00:00:00.000Z',
          currentUserRole: MEMBERSHIP_ROLES.MEMBER,
          lastReadMessageId: '507f1f77bcf86cd799439010',
        },
      ]),
    );

    renderList((queryClient) => {
      const data: MessagesInfiniteData = {
        pageParams: [undefined],
        pages: [
          {
            items: [
              {
                id: '507f1f77bcf86cd799439099',
                roomId,
                authorId: '507f1f77bcf86cd799439011',
                content: 'Later',
                clientMessageId: 'later',
                attachments: [],
                reactions: [],
                createdAt: '2026-08-18T01:00:00.000Z',
                updatedAt: '2026-08-18T01:00:00.000Z',
              },
            ],
          },
        ],
      };
      queryClient.setQueryData(queryKeys.messages.list(roomId), data);
    });

    expect(await screen.findByLabelText('1 unread messages')).toBeInTheDocument();
  });

  it('hides the unread badge for the room the user is currently viewing', async () => {
    const roomId = '507f1f77bcf86cd799439021';
    useRoomUiStore.setState({ currentRoomId: roomId });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse([
        {
          id: roomId,
          name: 'General',
          type: ROOM_TYPES.PUBLIC,
          createdAt: '2026-08-18T00:00:00.000Z',
          updatedAt: '2026-08-18T00:00:00.000Z',
          currentUserRole: MEMBERSHIP_ROLES.MEMBER,
          lastReadMessageId: '507f1f77bcf86cd799439010',
        },
      ]),
    );

    renderList((queryClient) => {
      const data: MessagesInfiniteData = {
        pageParams: [undefined],
        pages: [
          {
            items: [
              {
                id: '507f1f77bcf86cd799439099',
                roomId,
                authorId: '507f1f77bcf86cd799439011',
                content: 'Later',
                clientMessageId: 'later',
                attachments: [],
                reactions: [],
                createdAt: '2026-08-18T01:00:00.000Z',
                updatedAt: '2026-08-18T01:00:00.000Z',
              },
            ],
          },
        ],
      };
      queryClient.setQueryData(queryKeys.messages.list(roomId), data);
    });

    expect(await screen.findByRole('link', { name: /General/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('1 unread messages')).not.toBeInTheDocument();
  });

  it('shows a join control for public rooms the user has not joined', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse([
        {
          id: '507f1f77bcf86cd799439021',
          name: 'Town square',
          type: ROOM_TYPES.PUBLIC,
          createdAt: '2026-08-18T00:00:00.000Z',
          updatedAt: '2026-08-18T00:00:00.000Z',
        },
      ]),
    );
    renderList();
    expect(await screen.findByRole('button', { name: 'Join Town square' })).toBeInTheDocument();
  });

  it('shows the peer avatar on a direct conversation', async () => {
    const peerUserId = '507f1f77bcf86cd799439012';
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes(`/api/users/${peerUserId}`)) {
        return Promise.resolve(
          jsonResponse({
            id: peerUserId,
            username: 'bob',
            displayName: 'Bob',
            avatarUrl: `/api/users/${peerUserId}/avatar`,
            role: 'USER',
            createdAt: '2026-08-18T00:00:00.000Z',
          }),
        );
      }
      return Promise.resolve(
        jsonResponse([
          {
            id: '507f1f77bcf86cd799439022',
            type: ROOM_TYPES.DIRECT,
            peerUserId,
            createdAt: '2026-08-18T00:00:00.000Z',
            updatedAt: '2026-08-18T00:00:00.000Z',
            currentUserRole: MEMBERSHIP_ROLES.MEMBER,
          },
        ]),
      );
    });

    renderList();

    expect(await screen.findByRole('img', { name: 'Bob avatar' })).toHaveAttribute(
      'src',
      `/api/users/${peerUserId}/avatar`,
    );
    expect(screen.getByRole('link', { name: /Bob/ })).toBeInTheDocument();
  });

  it('filters rooms and lists matching people', async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

      if (url.includes('/api/users/search')) {
        return Promise.resolve(
          jsonResponse([
            {
              id: '507f1f77bcf86cd799439012',
              username: 'maria',
              displayName: 'Maria',
              role: 'USER',
              createdAt: '2026-08-18T00:00:00.000Z',
            },
          ]),
        );
      }

      return Promise.resolve(
        jsonResponse([
          {
            id: '507f1f77bcf86cd799439021',
            name: 'General',
            type: ROOM_TYPES.PUBLIC,
            createdAt: '2026-08-18T00:00:00.000Z',
            updatedAt: '2026-08-18T00:00:00.000Z',
            currentUserRole: MEMBERSHIP_ROLES.MEMBER,
          },
          {
            id: '507f1f77bcf86cd799439022',
            name: 'Secret',
            type: ROOM_TYPES.PRIVATE,
            createdAt: '2026-08-18T00:00:00.000Z',
            updatedAt: '2026-08-18T00:00:00.000Z',
            currentUserRole: MEMBERSHIP_ROLES.MEMBER,
          },
        ]),
      );
    });

    renderList();
    expect(await screen.findByRole('link', { name: /General/ })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Search rooms and people'), 'secret');
    expect(screen.queryByRole('link', { name: /General/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Secret/ })).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Search rooms and people'));
    await user.type(screen.getByLabelText('Search rooms and people'), 'maria');
    await waitFor(() => {
      expect(screen.getByText('Maria')).toBeInTheDocument();
    });
    expect(screen.getByText('@maria')).toBeInTheDocument();
  });
});
