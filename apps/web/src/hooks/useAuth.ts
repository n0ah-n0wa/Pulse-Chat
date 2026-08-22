import { useAuthStore } from '../store/auth-store';

export function useAuth() {
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const setSession = useAuthStore((state) => state.setSession);
  const updateUser = useAuthStore((state) => state.updateUser);
  const clearSession = useAuthStore((state) => state.clearSession);
  const isAuthenticated = accessToken !== null && user !== null;

  return {
    user,
    accessToken,
    isAuthenticated,
    setSession,
    updateUser,
    clearSession,
  };
}
