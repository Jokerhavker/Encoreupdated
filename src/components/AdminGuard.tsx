import { Navigate, Outlet } from 'react-router-dom';

export function AdminGuard() {
  const isAuthenticated = localStorage.getItem('adminKey') === 'ARUSHNGGA9';

  if (!isAuthenticated) {
    return <Navigate to="/suwmwiuwnwkw" replace />;
  }

  return <Outlet />;
}
