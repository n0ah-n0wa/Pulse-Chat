import { Navigate, Outlet } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth';

/** Redirects anonymous visitors to the login page. */
export function ProtectedRoute() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
