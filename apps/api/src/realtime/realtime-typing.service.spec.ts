import { beforeEach, describe, expect, it, vi } from 'vitest';

import { API_ERROR_CODES } from '@pulse-chat/shared';

import { ApiException } from '../common/errors/api.exception.js';
import type { RateLimitService } from '../rate-limit/rate-limit.service.js';
import type { RoomsService } from '../rooms/rooms.service.js';
import type { RealtimeMessageBroadcastService } from './realtime-message-broadcast.service.js';
import { RealtimeTypingService } from './realtime-typing.service.js';
import type { AuthenticatedSocket } from './realtime.types.js';

describe('RealtimeTypingService', () => {
  const requireMember = vi.fn();
  const consume = vi.fn();
  const broadcastTypingStarted = vi.fn();
  const broadcastTypingStopped = vi.fn();

  const service = new RealtimeTypingService(
    { requireMember } as unknown as RoomsService,
    { consume } as unknown as RateLimitService,
    {
      broadcastTypingStarted,
      broadcastTypingStopped,
    } as unknown as RealtimeMessageBroadcastService,
  );

  const socket = {
    data: { userId: 'user-1' },
  } as unknown as AuthenticatedSocket;

  beforeEach(() => {
    vi.clearAllMocks();
    requireMember.mockResolvedValue(undefined);
    consume.mockResolvedValue(undefined);
    broadcastTypingStarted.mockResolvedValue(undefined);
    broadcastTypingStopped.mockResolvedValue(undefined);
  });

  it('publishes typing start after membership and rate-limit checks', async () => {
    await service.relayTypingStart(socket, { roomId: '507f1f77bcf86cd799439021' });

    expect(requireMember).toHaveBeenCalledWith('user-1', '507f1f77bcf86cd799439021');
    expect(consume).toHaveBeenCalledWith('typing', 'user-1');
    expect(broadcastTypingStarted).toHaveBeenCalledWith(
      {
        roomId: '507f1f77bcf86cd799439021',
        userId: 'user-1',
      },
      socket,
    );
  });

  it('does not emit when the typing rate limit is exceeded', async () => {
    consume.mockRejectedValue(
      new ApiException(API_ERROR_CODES.TOO_MANY_REQUESTS, 'Too many requests.', 429),
    );

    await expect(
      service.relayTypingStart(socket, { roomId: '507f1f77bcf86cd799439021' }),
    ).rejects.toMatchObject({ code: API_ERROR_CODES.TOO_MANY_REQUESTS });
    expect(broadcastTypingStarted).not.toHaveBeenCalled();
  });
});
