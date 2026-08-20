import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { ROOM_ERROR_CODES } from '@pulse-chat/shared';

import { ApiException } from '../common/errors/api.exception.js';
import type { MessagesService } from '../messages/messages.service.js';
import { RealtimeMessageBroadcastService } from './realtime-message-broadcast.service.js';
import { RealtimeMessagesService } from './realtime-messages.service.js';
import type { AuthenticatedSocket } from './realtime.types.js';

const ROOM_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439012';

function createSocket(): AuthenticatedSocket {
  return {
    id: 'socket-1',
    data: { userId: USER_ID },
  } as AuthenticatedSocket;
}

describe('RealtimeMessagesService', () => {
  const message = {
    id: '507f1f77bcf86cd799439041',
    roomId: ROOM_ID,
    authorId: USER_ID,
    content: 'Hello',
    clientMessageId: 'client-1',
    attachments: [],
    reactions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('creates a message through MessagesService and broadcasts only on first send', async () => {
    const socket = createSocket();
    const createMessage = vi
      .fn<MessagesService['createMessage']>()
      .mockResolvedValue({ message, created: true });
    const broadcastNew = vi.fn<RealtimeMessageBroadcastService['broadcastNew']>();
    const service = new RealtimeMessagesService(
      { createMessage } as unknown as MessagesService,
      { broadcastNew } as unknown as RealtimeMessageBroadcastService,
    );

    await service.sendMessage(socket, {
      roomId: ROOM_ID,
      content: 'Hello',
      clientMessageId: 'client-1',
    });

    expect(createMessage).toHaveBeenCalledWith(USER_ID, ROOM_ID, {
      content: 'Hello',
      clientMessageId: 'client-1',
    });
    expect(broadcastNew).toHaveBeenCalledWith(ROOM_ID, message);
  });

  it('does not rebroadcast an idempotent retry', async () => {
    const socket = createSocket();
    const createMessage = vi
      .fn<MessagesService['createMessage']>()
      .mockResolvedValue({ message, created: false });
    const broadcastNew = vi.fn<RealtimeMessageBroadcastService['broadcastNew']>();
    const service = new RealtimeMessagesService(
      { createMessage } as unknown as MessagesService,
      { broadcastNew } as unknown as RealtimeMessageBroadcastService,
    );

    await service.sendMessage(socket, {
      roomId: ROOM_ID,
      content: 'Hello',
      clientMessageId: 'client-1',
    });

    expect(broadcastNew).not.toHaveBeenCalled();
  });

  it('propagates membership failures without broadcasting', async () => {
    const socket = createSocket();
    const createMessage = vi.fn<MessagesService['createMessage']>().mockRejectedValue(
      new ApiException(
        ROOM_ERROR_CODES.NOT_A_MEMBER,
        'You are not a member of this room.',
        HttpStatus.FORBIDDEN,
      ),
    );
    const broadcastNew = vi.fn<RealtimeMessageBroadcastService['broadcastNew']>();
    const service = new RealtimeMessagesService(
      { createMessage } as unknown as MessagesService,
      { broadcastNew } as unknown as RealtimeMessageBroadcastService,
    );

    await expect(
      service.sendMessage(socket, {
        roomId: ROOM_ID,
        content: 'Hello',
        clientMessageId: 'client-1',
      }),
    ).rejects.toMatchObject({ code: ROOM_ERROR_CODES.NOT_A_MEMBER });

    expect(broadcastNew).not.toHaveBeenCalled();
  });

  it('rejects malformed payloads before calling MessagesService', async () => {
    const socket = createSocket();
    const createMessage = vi.fn<MessagesService['createMessage']>();
    const broadcastNew = vi.fn<RealtimeMessageBroadcastService['broadcastNew']>();
    const service = new RealtimeMessagesService(
      { createMessage } as unknown as MessagesService,
      { broadcastNew } as unknown as RealtimeMessageBroadcastService,
    );

    await expect(
      service.sendMessage(socket, {
        roomId: 'bad-id',
        content: 'Hello',
        clientMessageId: 'client-1',
      }),
    ).rejects.toThrow();

    expect(createMessage).not.toHaveBeenCalled();
  });
});
