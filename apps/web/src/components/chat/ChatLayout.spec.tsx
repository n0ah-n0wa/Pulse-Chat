import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MEMBERSHIP_ROLES, ROOM_TYPES, TOKEN_TYPE } from '@pulse-chat/shared';

import { ChatLayout } from './ChatLayout';
import { ChatPane } from './ChatPane';
import { RoomPage } from '../../pages/RoomPage';
import { useAuthStore } from '../../store/auth-store';
import { useRoomUiStore } from '../../store/room-ui-store';

vi.mock('../../services/socket-service', () => ({
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

vi.mock('../../services/realtime-sync-service', () => ({
  bindRealtimeQueryClient: vi.fn(),
  startRealtimeSync: vi.fn(() => () => undefined),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const ROOM_ID = '507f1f77bcf86cd799439021';

const room = {
  id: ROOM_ID,
  name: 'General',
  type: ROOM_TYPES.PUBLIC,
  createdAt: '2026-08-18T00:00:00.000Z',
  updatedAt: '2026-08-18T00:00:00.000Z',
  currentUserRole: MEMBERSHIP_ROLES.MEMBER,
};

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  if (
    typeof input === 'object' &&
    input !== null &&
    'url' in input &&
    typeof input.url === 'string'
  ) {
    return input.url;
  }
  return '';
}

function mockApi(rooms: unknown[] = [room]) {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = requestUrl(input);
    const path = (url.split('?')[0] ?? url).replace(/\/$/, '');

    if (path.endsWith('/api/rooms') && !path.includes('/api/rooms/')) {
      return Promise.resolve(jsonResponse(rooms));
    }
    if (url.includes('/api/rooms/') && url.includes('/members')) {
      return Promise.resolve(jsonResponse([]));
    }
    if (url.includes('/api/rooms/') && url.includes('/messages')) {
      return Promise.resolve(jsonResponse({ items: [] }));
    }
    if (
      url.includes(`/api/rooms/${ROOM_ID}`) &&
      !url.includes('/members') &&
      !url.includes('/messages')
    ) {
      return Promise.resolve(jsonResponse(room));
    }
    if (url.includes('/api/notifications')) {
      return Promise.resolve(jsonResponse({ items: [] }));
    }
    return Promise.resolve(
      jsonResponse({ statusCode: 404, code: 'NOT_FOUND', message: 'Missing' }, 404),
    );
  });
}

function renderLayout(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        path: '/app',
        element: <ChatLayout />,
        children: [
          { index: true, element: <ChatPane /> },
          { path: 'rooms/:roomId', element: <RoomPage /> },
        ],
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

describe('ChatLayout', () => {
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
    useRoomUiStore.setState({
      currentRoomId: null,
      isRoomNavOpen: false,
      isMemberPanelOpen: false,
      isNotificationPanelOpen: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().clearSession();
  });

  it('renders the three-pane shell with an empty chat state', async () => {
    mockApi();
    renderLayout('/app');

    expect(await screen.findByRole('link', { name: /General/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Select a room' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Rooms' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Members' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Color theme' })).toBeInTheDocument();
  });

  it('opens the room drawer on smaller layouts', async () => {
    const user = userEvent.setup();
    mockApi();
    renderLayout('/app');

    await screen.findByRole('link', { name: /General/ });
    await user.click(screen.getByRole('button', { name: 'Rooms' }));

    expect(screen.getByRole('dialog', { name: 'Rooms' })).toBeInTheDocument();
  });

  it('opens the members drawer for the current room', async () => {
    const user = userEvent.setup();
    mockApi();
    renderLayout(`/app/rooms/${ROOM_ID}`);

    await screen.findByRole('heading', { name: 'General' });
    await user.click(screen.getByRole('button', { name: 'Members' }));

    expect(screen.getByRole('dialog', { name: 'Members' })).toBeInTheDocument();
  });
});
