import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { queryClient } from '../lib/query-client';
import { resetClientState } from '../lib/reset-client-state';
import { authService } from '../services/auth-service';
import { useAuthStore } from '../store/auth-store';

export function useLogout() {
  const navigate = useNavigate();
  const refreshToken = useAuthStore((state) => state.refreshToken);

  return useMutation({
    mutationFn: async () => {
      if (refreshToken === null) {
        return;
      }

      try {
        await authService.logout(refreshToken);
      } catch {
        // Local session is cleared even when revocation fails.
      }
    },
    onSettled: () => {
      resetClientState(queryClient);
      void navigate('/login', { replace: true });
    },
  });
}
