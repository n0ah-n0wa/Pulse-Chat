import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MEMBERSHIP_ROLES, ROOM_TYPES, TOKEN_TYPE } from '@pulse-chat/shared';

import { useAuthStore } from '../../store/auth-store';
import { useSocketStore } from '../../store/socket-store';
import { ChatPane } from './ChatPane';

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

const ROOM_ID = '507f1f77bcf86cd799439021';
const USER_ID = '507f1f77bcf86cd799439011';
const OTHER_USER_ID = '507f1f77bcf86cd799439012';
const MESSAGE_ID = '507f1f77bcf86cd799439041';

const room = {
  id: ROOM_ID,
  name: 'General',
  type: ROOM_TYPES.PUBLIC,
  createdAt: '2026-08-18T00:00:00.000Z',
  updatedAt: '2026-08-18T00:00:00.000Z',
  currentUserRole: MEMBERSHIP_ROLES.MEMBER,
};

const historyMessage = {
  id: MESSAGE_ID,
  roomId: ROOM_ID,
  authorId: OTHER_USER_ID,
  content: 'Welcome to the room',
  clientMessageId: 'client-history-1',
  attachments: [],
  reactions: [],
  createdAt: '2026-08-18T10:00:00.000Z',
  updatedAt: '2026-08-18T10:00:00.000Z',
};

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

function renderChatPane(roomId: string = ROOM_ID) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ChatPane roomId={roomId} />
    </QueryClientProvider>,
  );
}

describe('ChatPane', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      value: 600,
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      value: 1200,
    });

    useAuthStore.getState().setSession({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      accessTokenExpiresIn: 900,
      tokenType: TOKEN_TYPE,
      user: {
        id: USER_ID,
        username: 'alice',
        displayName: 'Alice',
        email: 'alice@example.com',
        role: 'USER',
        createdAt: '2026-08-18T00:00:00.000Z',
        updatedAt: '2026-08-18T00:00:00.000Z',
      },
    });
    useSocketStore.getState().setConnectionState('connected');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().clearSession();
    useSocketStore.getState().resetConnectionState();
  });

  it('loads message history and sends a new message', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = requestUrl(input);
      const method = init?.method ?? 'GET';

      if (url.includes(`/api/rooms/${ROOM_ID}/messages`) && method === 'GET') {
        return Promise.resolve(jsonResponse({ items: [historyMessage] }));
      }
      if (url.includes(`/api/rooms/${ROOM_ID}/messages`) && method === 'POST') {
        const rawBody = init?.body;
        const bodyText = typeof rawBody === 'string' ? rawBody : '{}';
        const body = JSON.parse(bodyText) as {
          content: string;
          clientMessageId: string;
        };
        return Promise.resolve(
          jsonResponse({
            id: '507f1f77bcf86cd799439042',
            roomId: ROOM_ID,
            authorId: USER_ID,
            content: body.content,
            clientMessageId: body.clientMessageId,
            attachments: [],
            reactions: [],
            createdAt: '2026-08-18T10:05:00.000Z',
            updatedAt: '2026-08-18T10:05:00.000Z',
          }),
        );
      }
      if (url.includes(`/api/rooms/${ROOM_ID}/read`) && method === 'POST') {
        return Promise.resolve(
          jsonResponse({
            id: '507f1f77bcf86cd799439031',
            roomId: ROOM_ID,
            userId: USER_ID,
            role: MEMBERSHIP_ROLES.MEMBER,
            joinedAt: '2026-08-18T00:00:00.000Z',
            lastReadMessageId: MESSAGE_ID,
            lastReadAt: '2026-08-18T10:00:00.000Z',
          }),
        );
      }
      if (url.includes(`/api/users/${OTHER_USER_ID}`)) {
        return Promise.resolve(
          jsonResponse({
            id: OTHER_USER_ID,
            username: 'bob',
            displayName: 'Bob',
            role: 'USER',
            createdAt: '2026-08-18T00:00:00.000Z',
          }),
        );
      }
      if (url.includes(`/api/users/${USER_ID}`)) {
        return Promise.resolve(
          jsonResponse({
            id: USER_ID,
            username: 'alice',
            displayName: 'Alice',
            role: 'USER',
            createdAt: '2026-08-18T00:00:00.000Z',
          }),
        );
      }
      if (url.includes(`/api/rooms/${ROOM_ID}`)) {
        return Promise.resolve(jsonResponse(room));
      }
      return Promise.resolve(
        jsonResponse({ statusCode: 404, code: 'NOT_FOUND', message: 'Missing' }, 404),
      );
    });

    renderChatPane();

    expect(await screen.findByRole('heading', { name: 'General' })).toBeInTheDocument();
    expect(await screen.findByText('Welcome to the room')).toBeInTheDocument();
    expect(await screen.findByText('Bob')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Message'), 'Hello from Alice{Enter}');

    await waitFor(() => {
      expect(screen.getByText('Hello from Alice')).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/api/rooms/${ROOM_ID}/messages`),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('shows empty room, offline banner, and message load errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = requestUrl(input);
      if (url.includes(`/api/rooms/${ROOM_ID}/messages`)) {
        return Promise.resolve(
          jsonResponse({ statusCode: 500, code: 'INTERNAL', message: 'boom' }, 500),
        );
      }
      if (url.includes(`/api/rooms/${ROOM_ID}`)) {
        return Promise.resolve(jsonResponse(room));
      }
      return Promise.resolve(
        jsonResponse({ statusCode: 404, code: 'NOT_FOUND', message: 'Missing' }, 404),
      );
    });

    renderChatPane();

    expect(await screen.findByText('Could not load messages')).toBeInTheDocument();

    useSocketStore.getState().setConnectionState('disconnected');
    expect(await screen.findByRole('status')).toHaveTextContent('You are offline');
  });

  it('renders empty history when the room has no messages', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = requestUrl(input);
      if (url.includes(`/api/rooms/${ROOM_ID}/messages`)) {
        return Promise.resolve(jsonResponse({ items: [] }));
      }
      if (url.includes(`/api/rooms/${ROOM_ID}`)) {
        return Promise.resolve(jsonResponse(room));
      }
      return Promise.resolve(
        jsonResponse({ statusCode: 404, code: 'NOT_FOUND', message: 'Missing' }, 404),
      );
    });

    renderChatPane();

    expect(await screen.findByText('No messages yet')).toBeInTheDocument();
  });
});
