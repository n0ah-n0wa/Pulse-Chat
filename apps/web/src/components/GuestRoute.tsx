import { Navigate, Outlet } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth';

/** Keeps authenticated users out of login and registration pages. */
export function GuestRoute() {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate to="/app" replace />;
  }

  return <Outlet />;
}
