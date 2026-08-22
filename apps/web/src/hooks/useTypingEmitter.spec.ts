import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLIENT_SOCKET_EVENTS, TYPING_TIMEOUT_MS } from '@pulse-chat/shared';

import { useTypingEmitter } from './useTypingEmitter';
import { useSocketStore } from '../store/socket-store';

const { emit } = vi.hoisted(() => ({ emit: vi.fn() }));

vi.mock('../services/socket-service', () => ({
  getSocketService: () => ({ emit }),
}));

describe('useTypingEmitter', () => {
  beforeEach(() => {
    emit.mockClear();
    useSocketStore.getState().setConnectionState('connected');
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    useSocketStore.getState().resetConnectionState();
  });

  it('debounces typing:start and auto-emits typing:stop after the idle timeout', () => {
    const { result } = renderHook(() => useTypingEmitter('507f1f77bcf86cd799439021', true));

    act(() => {
      result.current.notifyTyping();
    });
    expect(emit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(emit).toHaveBeenCalledWith(CLIENT_SOCKET_EVENTS.TYPING_START, {
      roomId: '507f1f77bcf86cd799439021',
    });

    act(() => {
      vi.advanceTimersByTime(TYPING_TIMEOUT_MS);
    });
    expect(emit).toHaveBeenCalledWith(CLIENT_SOCKET_EVENTS.TYPING_STOP, {
      roomId: '507f1f77bcf86cd799439021',
    });
  });

  it('does not emit while disconnected', () => {
    useSocketStore.getState().setConnectionState('disconnected');
    const { result } = renderHook(() => useTypingEmitter('507f1f77bcf86cd799439021', true));

    act(() => {
      result.current.notifyTyping();
      vi.advanceTimersByTime(400);
    });

    expect(emit).not.toHaveBeenCalled();
  });
});
