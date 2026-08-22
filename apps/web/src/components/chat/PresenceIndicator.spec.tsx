import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { PublicUserProfile } from '@pulse-chat/shared';

import { usePresenceStore } from '../../store/presence-store';
import { useAuthStore } from '../../store/auth-store';
import { PresenceIndicator } from './PresenceIndicator';

const OTHER_USER = '507f1f77bcf86cd799439012';
const SELF_USER = '507f1f77bcf86cd799439011';

function renderIndicator(userId: string, authors: ReadonlyMap<string, PublicUserProfile>) {
  return render(<PresenceIndicator userId={userId} authors={authors} showLabel />);
}

describe('PresenceIndicator', () => {
  afterEach(() => {
    useAuthStore.getState().clearSession();
    usePresenceStore.getState().resetPresence();
  });

  it('renders nothing for the current user', () => {
    useAuthStore.setState({
      accessToken: 'token',
      refreshToken: 'refresh',
      user: {
        id: SELF_USER,
        username: 'alice',
        displayName: 'Alice',
        email: 'alice@example.com',
        role: 'USER',
        createdAt: '2026-08-18T00:00:00.000Z',
        updatedAt: '2026-08-18T00:00:00.000Z',
      },
    });

    const authors = new Map<string, PublicUserProfile>();
    const { container } = renderIndicator(SELF_USER, authors);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows online label when presence store marks the user online', () => {
    usePresenceStore.getState().resetPresence();
    usePresenceStore.getState().setUserOnline(OTHER_USER);

    const authors = new Map<string, PublicUserProfile>([
      [
        OTHER_USER,
        {
          id: OTHER_USER,
          username: 'bob',
          displayName: 'Bob',
          role: 'USER',
          createdAt: '2026-08-18T00:00:00.000Z',
        },
      ],
    ]);

    renderIndicator(OTHER_USER, authors);
    expect(screen.getByText('Online')).toBeInTheDocument();
  });
});
