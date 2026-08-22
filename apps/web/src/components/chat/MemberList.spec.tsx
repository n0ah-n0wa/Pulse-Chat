import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
      <MemberList roomId={roomId} />
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

      if (url.includes(`/api/users/${MEMBER_USER}`)) {
        return Promise.resolve(
          jsonResponse({
            id: MEMBER_USER,
            username: 'bob',
            displayName: 'Bob',
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
    expect(screen.getByText('owner')).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('shows an error when members cannot be loaded', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ statusCode: 403, code: 'FORBIDDEN', message: 'Denied' }, 403),
    );

    renderMembers(ROOM_ID);

    expect(await screen.findByText('Could not load members')).toBeInTheDocument();
  });
});
