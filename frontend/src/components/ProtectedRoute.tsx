// src/components/ProtectedRoute.tsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import type { UserRole } from '../types/auth';
import { getHomePathForRole, normalizeRole } from '../lib/authRouting';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Roles that are allowed to access this route */
  allowedRoles: UserRole[];
}

function clearSession() {
  localStorage.removeItem('user');
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
}

/**
 * ProtectedRoute guards a route by:
 *  1. Redirecting unauthenticated users to /login.
 *  2. Redirecting authenticated users whose role is NOT in `allowedRoles`
 *     to the correct dashboard for their role.
 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const role = normalizeRole(user.role);
  if (!role) {
    clearSession();
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(role)) {
    return <Navigate to={getHomePathForRole(role)} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
