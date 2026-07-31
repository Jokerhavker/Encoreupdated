import { Navigate, Outlet } from 'react-router-dom';

export function AdminGuard() {
  const isAuthenticated = localStorage.getItem('admin_logged_in') === 'true';

  if (!isAuthenticated) {
    return <Navigate to="/suwmwiuwnwkw" replace />;
  }

  return <Outlet />;
}
