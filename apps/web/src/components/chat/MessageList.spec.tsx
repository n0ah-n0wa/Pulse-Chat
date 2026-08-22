import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MessageList } from './MessageList';

describe('MessageList', () => {
  it('shows loading, empty, and error states', () => {
    const { rerender } = render(
      <MessageList
        messages={[]}
        authors={new Map()}
        currentUserId={undefined}
        isLoading
        isFetchingOlder={false}
        hasOlder={false}
        onLoadOlder={vi.fn()}
        onRetry={vi.fn()}
        onReply={vi.fn()}
        onToggleReaction={vi.fn()}
      />,
    );

    expect(screen.getByText('Loading messages…')).toBeInTheDocument();

    rerender(
      <MessageList
        messages={[]}
        authors={new Map()}
        currentUserId={undefined}
        isLoading={false}
        isFetchingOlder={false}
        hasOlder={false}
        errorMessage="Network down"
        onLoadOlder={vi.fn()}
        onRetry={vi.fn()}
        onReply={vi.fn()}
        onToggleReaction={vi.fn()}
      />,
    );

    expect(screen.getByText('Could not load messages')).toBeInTheDocument();
    expect(screen.getByText('Network down')).toBeInTheDocument();

    rerender(
      <MessageList
        messages={[]}
        authors={new Map()}
        currentUserId={undefined}
        isLoading={false}
        isFetchingOlder={false}
        hasOlder={false}
        onLoadOlder={vi.fn()}
        onRetry={vi.fn()}
        onReply={vi.fn()}
        onToggleReaction={vi.fn()}
      />,
    );

    expect(screen.getByText('No messages yet')).toBeInTheDocument();
  });
});
