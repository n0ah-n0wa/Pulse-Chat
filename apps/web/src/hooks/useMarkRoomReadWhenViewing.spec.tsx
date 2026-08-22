import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../store/auth-store';
import {
  MARK_ROOM_READ_DEBOUNCE_MS,
  useMarkRoomReadWhenViewing,
} from './useMarkRoomReadWhenViewing';

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock('./useMarkRoomRead', () => ({
  useMarkRoomRead: () => ({ mutate }),
}));

const ROOM_ID = '507f1f77bcf86cd799439021';
const MESSAGE_A = '507f1f77bcf86cd799439041';
const MESSAGE_B = '507f1f77bcf86cd799439042';

describe('useMarkRoomReadWhenViewing', () => {
  beforeEach(() => {
    mutate.mockClear();
    useAuthStore.setState({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: null,
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    useAuthStore.getState().clearSession();
  });

  it('does not mark read until the trailing debounce elapses', () => {
    renderHook(() => useMarkRoomReadWhenViewing(ROOM_ID, MESSAGE_A, true));

    expect(mutate).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(MARK_ROOM_READ_DEBOUNCE_MS - 1);
    });
    expect(mutate).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ messageId: MESSAGE_A });
  });

  it('coalesces rapid latest-message changes into one request', () => {
    const { rerender } = renderHook(
      ({ messageId }: { messageId: string }) =>
        useMarkRoomReadWhenViewing(ROOM_ID, messageId, true),
      { initialProps: { messageId: MESSAGE_A } },
    );

    act(() => {
      vi.advanceTimersByTime(200);
    });

    rerender({ messageId: MESSAGE_B });

    act(() => {
      vi.advanceTimersByTime(MARK_ROOM_READ_DEBOUNCE_MS - 1);
    });
    expect(mutate).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ messageId: MESSAGE_B });
  });

  it('flushes the pending latest message when the room unmounts', () => {
    const { unmount } = renderHook(() => useMarkRoomReadWhenViewing(ROOM_ID, MESSAGE_A, true));

    unmount();

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ messageId: MESSAGE_A });
  });

  it('does not flush a pending read after the session is cleared', () => {
    const { unmount } = renderHook(() => useMarkRoomReadWhenViewing(ROOM_ID, MESSAGE_A, true));
    useAuthStore.getState().clearSession();
    unmount();

    expect(mutate).not.toHaveBeenCalled();
  });

  it('does not POST /read after logout while a debounce is pending', () => {
    renderHook(() => useMarkRoomReadWhenViewing(ROOM_ID, MESSAGE_A, true));
    useAuthStore.getState().clearSession();

    act(() => {
      vi.advanceTimersByTime(MARK_ROOM_READ_DEBOUNCE_MS);
    });

    expect(mutate).not.toHaveBeenCalled();
  });
});
