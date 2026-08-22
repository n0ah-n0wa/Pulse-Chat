import { useMutation } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';

import type { LoginInput } from '@pulse-chat/shared';

import { safeInternalPath } from '../lib/safe-internal-path';
import { authService } from '../services/auth-service';
import { useAuthStore } from '../store/auth-store';

interface LoginLocationState {
  readonly from?: string;
}

export function useLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useAuthStore((state) => state.setSession);

  return useMutation({
    mutationFn: (input: LoginInput) => authService.login(input),
    onSuccess: (session) => {
      setSession(session);
      const redirectTo = safeInternalPath((location.state as LoginLocationState | null)?.from);
      void navigate(redirectTo, { replace: true });
    },
  });
}
