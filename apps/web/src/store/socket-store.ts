import { create } from 'zustand';

import type { SocketConnectionState } from '../types/index.js';

interface SocketState {
  readonly connectionState: SocketConnectionState;
  readonly setConnectionState: (connectionState: SocketConnectionState) => void;
  readonly resetConnectionState: () => void;
}

export const useSocketStore = create<SocketState>((set) => ({
  connectionState: 'disconnected',
  setConnectionState: (connectionState) => {
    set({ connectionState });
  },
  resetConnectionState: () => {
    set({ connectionState: 'disconnected' });
  },
}));
