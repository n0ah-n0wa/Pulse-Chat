import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { PublicUserProfile } from '@pulse-chat/shared';

import { TypingIndicator } from './TypingIndicator';

const alice: PublicUserProfile = {
  id: 'user-1',
  username: 'alice',
  displayName: 'Alice',
  role: 'USER',
  createdAt: '2026-08-18T00:00:00.000Z',
};

const bob: PublicUserProfile = {
  id: 'user-2',
  username: 'bob',
  displayName: 'Bob',
  role: 'USER',
  createdAt: '2026-08-18T00:00:00.000Z',
};

describe('TypingIndicator', () => {
  it('renders nothing when nobody is typing', () => {
    const { container } = render(<TypingIndicator typingUserIds={[]} authors={new Map()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('names one or two typists and collapses larger groups', () => {
    const authors = new Map([
      [alice.id, alice],
      [bob.id, bob],
    ]);

    const { rerender } = render(<TypingIndicator typingUserIds={[alice.id]} authors={authors} />);
    expect(screen.getByRole('status')).toHaveTextContent('Alice is typing…');

    rerender(<TypingIndicator typingUserIds={[alice.id, bob.id]} authors={authors} />);
    expect(screen.getByRole('status')).toHaveTextContent('Alice and Bob are typing…');

    rerender(<TypingIndicator typingUserIds={[alice.id, bob.id, 'user-3']} authors={authors} />);
    expect(screen.getByRole('status')).toHaveTextContent('Several people are typing…');
  });
});
