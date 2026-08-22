import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { AuthSessionResponse, AuthTokensResponse } from '@pulse-chat/shared';

import type { AuthSession } from '../types/index.js';

interface AuthState {
  readonly accessToken: string | null;
  readonly refreshToken: string | null;
  readonly user: AuthSession['user'] | null;
  readonly setSession: (session: AuthSessionResponse) => void;
  readonly applyTokens: (tokens: AuthTokensResponse) => void;
  readonly updateUser: (user: AuthSession['user']) => void;
  readonly clearSession: () => void;
  readonly isAuthenticated: () => boolean;
}

const initialState = {
  accessToken: null,
  refreshToken: null,
  user: null,
} as const;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      ...initialState,
      setSession: (session) => {
        set({
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          user: session.user,
        });
      },
      applyTokens: (tokens) => {
        set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        });
      },
      updateUser: (user) => {
        set({ user });
      },
      clearSession: () => {
        set(initialState);
      },
      isAuthenticated: () => get().accessToken !== null && get().user !== null,
    }),
    {
      name: 'pulse-chat-auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
      }),
    },
  ),
);
