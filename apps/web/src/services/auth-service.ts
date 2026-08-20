import type {
  AuthSessionResponse,
  LoginInput,
  LogoutInput,
  RegisterInput,
} from '@pulse-chat/shared';

import { apiClient } from './api-client';

export const authService = {
  login(input: LoginInput): Promise<AuthSessionResponse> {
    return apiClient.post<AuthSessionResponse>('/api/auth/login', input, { auth: false });
  },

  register(input: RegisterInput): Promise<AuthSessionResponse> {
    return apiClient.post<AuthSessionResponse>('/api/auth/register', input, { auth: false });
  },

  logout(refreshToken: string): Promise<void> {
    const body: LogoutInput = { refreshToken };
    return apiClient.post<void>('/api/auth/logout', body, { auth: false });
  },
};
