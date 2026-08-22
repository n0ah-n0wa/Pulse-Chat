import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { MessageResponse } from '@pulse-chat/shared';
import { MESSAGE_MAX_LENGTH } from '@pulse-chat/shared';

import { MessageItem } from './MessageItem';

function message(overrides: Partial<MessageResponse> = {}): MessageResponse {
  return {
    id: '507f1f77bcf86cd799439041',
    roomId: '507f1f77bcf86cd799439021',
    authorId: '507f1f77bcf86cd799439011',
    content: 'Hello world',
    clientMessageId: 'client-1',
    attachments: [],
    reactions: [{ emoji: '👍', count: 2, reactedByCurrentUser: true }],
    createdAt: '2026-08-18T12:30:00.000Z',
    updatedAt: '2026-08-18T12:30:00.000Z',
    ...overrides,
  };
}

describe('MessageItem', () => {
  it('renders author, content, edited marker, reply preview, and reactions', async () => {
    const user = userEvent.setup();
    const onReply = vi.fn();
    const onToggleReaction = vi.fn();
    const authors = new Map([
      [
        '507f1f77bcf86cd799439011',
        {
          id: '507f1f77bcf86cd799439011',
          username: 'alice',
          displayName: 'Alice',
          role: 'USER' as const,
          createdAt: '2026-08-18T00:00:00.000Z',
        },
      ],
      [
        '507f1f77bcf86cd799439012',
        {
          id: '507f1f77bcf86cd799439012',
          username: 'bob',
          displayName: 'Bob',
          role: 'USER' as const,
          createdAt: '2026-08-18T00:00:00.000Z',
        },
      ],
    ]);

    render(
      <MessageItem
        message={message({
          editedAt: '2026-08-18T12:31:00.000Z',
          replyTo: {
            id: '507f1f77bcf86cd799439040',
            authorId: '507f1f77bcf86cd799439012',
            content: 'Earlier note',
            createdAt: '2026-08-18T12:00:00.000Z',
          },
          attachments: [
            {
              id: '507f1f77bcf86cd799439060',
              filename: 'notes.pdf',
              mimeType: 'application/pdf',
              sizeBytes: 12,
              url: '/api/files/notes.pdf',
              createdAt: '2026-08-18T12:30:00.000Z',
            },
          ],
        })}
        currentUserId="507f1f77bcf86cd799439099"
        authors={authors}
        showAuthor
        showDaySeparator={false}
        dayLabel=""
        onReply={onReply}
        onToggleReaction={onToggleReaction}
      />,
    );

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Hello world')).toBeInTheDocument();
    expect(screen.getByText('(edited)')).toBeInTheDocument();
    expect(screen.getByText('Earlier note')).toBeInTheDocument();
    expect(screen.getByText(/notes\.pdf/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reply' }));
    expect(onReply).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /👍/ }));
    expect(onToggleReaction).toHaveBeenCalledWith('507f1f77bcf86cd799439041', '👍');
  });

  it('renders deleted messages without content actions', () => {
    render(
      <MessageItem
        message={message({
          content: '',
          deletedAt: '2026-08-18T12:40:00.000Z',
          reactions: [],
        })}
        currentUserId="507f1f77bcf86cd799439011"
        authors={new Map()}
        showAuthor
        showDaySeparator={false}
        dayLabel=""
        onReply={vi.fn()}
        onToggleReaction={vi.fn()}
      />,
    );

    expect(screen.getByText('Message deleted')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reply' })).not.toBeInTheDocument();
  });

  it('lets the author edit and delete their own message', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    render(
      <MessageItem
        message={message({ reactions: [] })}
        currentUserId="507f1f77bcf86cd799439011"
        authors={new Map()}
        showAuthor
        showDaySeparator={false}
        dayLabel=""
        onReply={vi.fn()}
        onToggleReaction={vi.fn()}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.clear(screen.getByLabelText('Edited message'));
    await user.type(screen.getByLabelText('Edited message'), 'Updated copy');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onEdit).toHaveBeenCalledWith('507f1f77bcf86cd799439041', 'Updated copy');

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith('507f1f77bcf86cd799439041');
  });

  it('renders untrusted message HTML as text and caps the edit field', async () => {
    const user = userEvent.setup();

    const { container } = render(
      <MessageItem
        message={message({
          content: '<script>alert(1)</script>',
          reactions: [],
        })}
        currentUserId="507f1f77bcf86cd799439011"
        authors={new Map()}
        showAuthor
        showDaySeparator={false}
        dayLabel=""
        onReply={vi.fn()}
        onToggleReaction={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Edited message')).toHaveAttribute(
      'maxLength',
      String(MESSAGE_MAX_LENGTH),
    );
  });
});
