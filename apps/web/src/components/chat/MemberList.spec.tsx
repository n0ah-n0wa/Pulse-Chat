import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MEMBERSHIP_ROLES } from '@pulse-chat/shared';

import { MemberList } from './MemberList';
import { useAuthStore } from '../../store/auth-store';
import { usePresenceStore } from '../../store/presence-store';

const ROOM_ID = '507f1f77bcf86cd799439021';
const MEMBER_USER = '507f1f77bcf86cd799439012';

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

function renderMembers(roomId: string | undefined) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <MemberList roomId={roomId} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('MemberList', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: 'token',
      refreshToken: 'refresh',
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
    usePresenceStore.getState().resetPresence();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().clearSession();
    usePresenceStore.getState().resetPresence();
  });

  it('prompts the user to select a room', () => {
    renderMembers(undefined);
    expect(screen.getByText('No room selected')).toBeInTheDocument();
  });

  it('shows members with profile names and online presence', async () => {
    usePresenceStore.getState().setUserOnline(MEMBER_USER);

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = requestUrl(input);

      if (url.includes(`/api/rooms/${ROOM_ID}/members`)) {
        return Promise.resolve(
          jsonResponse([
            {
              id: '507f1f77bcf86cd799439031',
              roomId: ROOM_ID,
              userId: MEMBER_USER,
              role: MEMBERSHIP_ROLES.OWNER,
              joinedAt: '2026-08-18T00:00:00.000Z',
            },
          ]),
        );
      }

      if (url.includes(`/api/rooms/${ROOM_ID}`)) {
        return Promise.resolve(
          jsonResponse({
            id: ROOM_ID,
            name: 'General',
            type: 'PUBLIC',
            currentUserRole: MEMBERSHIP_ROLES.OWNER,
            createdAt: '2026-08-18T00:00:00.000Z',
            updatedAt: '2026-08-18T00:00:00.000Z',
          }),
        );
      }

      if (url.includes(`/api/users/${MEMBER_USER}`)) {
        return Promise.resolve(
          jsonResponse({
            id: MEMBER_USER,
            username: 'bob',
            displayName: 'Bob',
            avatarUrl: `/api/users/${MEMBER_USER}/avatar`,
            role: 'USER',
            createdAt: '2026-08-18T00:00:00.000Z',
          }),
        );
      }

      return Promise.resolve(
        jsonResponse({ statusCode: 404, code: 'NOT_FOUND', message: 'Missing' }, 404),
      );
    });

    renderMembers(ROOM_ID);

    expect(await screen.findByText('Bob')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Bob avatar' })).toHaveAttribute(
      'src',
      `/api/users/${MEMBER_USER}/avatar`,
    );
    expect(screen.getByText('owner')).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.getByLabelText('Invite a member')).toBeInTheDocument();
  });

  it('invites a matching user into the room', async () => {
    const user = userEvent.setup();
    const invitedUserId = '507f1f77bcf86cd799439099';

    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = requestUrl(input);
      const method = init?.method ?? 'GET';

      if (url.includes(`/api/rooms/${ROOM_ID}/members`) && method === 'POST') {
        return Promise.resolve(
          jsonResponse({
            id: '507f1f77bcf86cd799439032',
            roomId: ROOM_ID,
            userId: invitedUserId,
            role: MEMBERSHIP_ROLES.MEMBER,
            joinedAt: '2026-08-18T00:00:00.000Z',
          }),
        );
      }

      if (url.includes(`/api/rooms/${ROOM_ID}/members`)) {
        return Promise.resolve(jsonResponse([]));
      }

      if (url.includes(`/api/rooms/${ROOM_ID}`)) {
        return Promise.resolve(
          jsonResponse({
            id: ROOM_ID,
            name: 'Private cabal',
            type: 'PRIVATE',
            currentUserRole: MEMBERSHIP_ROLES.OWNER,
            createdAt: '2026-08-18T00:00:00.000Z',
            updatedAt: '2026-08-18T00:00:00.000Z',
          }),
        );
      }

      if (url.includes('/api/users/search')) {
        return Promise.resolve(
          jsonResponse([
            {
              id: invitedUserId,
              username: 'carol',
              displayName: 'Carol',
              role: 'USER',
              createdAt: '2026-08-18T00:00:00.000Z',
            },
          ]),
        );
      }

      return Promise.resolve(
        jsonResponse({ statusCode: 404, code: 'NOT_FOUND', message: 'Missing' }, 404),
      );
    });

    renderMembers(ROOM_ID);
    await user.type(await screen.findByLabelText('Invite by name'), 'carol');
    expect(await screen.findByRole('button', { name: 'Invite' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Invite' }));
    expect(await screen.findByLabelText('Invite a member')).toBeInTheDocument();
  });

  it('shows an error when members cannot be loaded', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ statusCode: 403, code: 'FORBIDDEN', message: 'Denied' }, 403),
    );

    renderMembers(ROOM_ID);

    expect(await screen.findByText('Could not load members')).toBeInTheDocument();
  });
});
