import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import type { RegisterInput } from '@pulse-chat/shared';

import { authService } from '../services/auth-service';
import { useAuthStore } from '../store/auth-store';

export function useRegister() {
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);

  return useMutation({
    mutationFn: (input: RegisterInput) => authService.register(input),
    onSuccess: (session) => {
      setSession(session);
      void navigate('/app', { replace: true });
    },
  });
}
