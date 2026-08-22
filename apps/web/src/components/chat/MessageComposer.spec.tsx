import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { MessageResponse } from '@pulse-chat/shared';

import { MessageComposer } from './MessageComposer';

const reply: MessageResponse = {
  id: '507f1f77bcf86cd799439041',
  roomId: '507f1f77bcf86cd799439021',
  authorId: '507f1f77bcf86cd799439011',
  content: 'Original',
  clientMessageId: 'client-1',
  attachments: [],
  reactions: [],
  createdAt: '2026-08-18T00:00:00.000Z',
  updatedAt: '2026-08-18T00:00:00.000Z',
};

describe('MessageComposer', () => {
  it('submits on Enter and supports reply cancellation', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    const onCancelReply = vi.fn();

    render(
      <MessageComposer
        replyTo={reply}
        authors={
          new Map([
            [
              reply.authorId,
              {
                id: reply.authorId,
                username: 'alice',
                displayName: 'Alice',
                role: 'USER',
                createdAt: '2026-08-18T00:00:00.000Z',
              },
            ],
          ])
        }
        currentUserId="other"
        onCancelReply={onCancelReply}
        onSend={onSend}
      />,
    );

    expect(screen.getByText(/Replying to Alice/)).toBeInTheDocument();

    const input = screen.getByLabelText('Message');
    await user.type(input, 'Hi there{Enter}');

    expect(onSend).toHaveBeenCalledWith('Hi there');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancelReply).toHaveBeenCalled();
  });

  it('disables sending while offline', () => {
    render(
      <MessageComposer
        disabled
        replyTo={null}
        authors={new Map()}
        currentUserId={undefined}
        onCancelReply={vi.fn()}
        onSend={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByPlaceholderText('Reconnect to send messages')).toBeDisabled();
  });
});
