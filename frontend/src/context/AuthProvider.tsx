import React, { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AuthContext } from './AuthContext';
import type { User } from '../types/auth';
import { login as apiLogin, logout as apiLogout } from '../services/authService';
import { normalizeRole } from '../lib/authRouting';
import { AUTH_SESSION_EXPIRED } from '../lib/authSession';

interface Props {
  children: ReactNode;
}

const readAccessToken = (): string | null => {
  try {
    return localStorage.getItem('access_token');
  } catch {
    return null;
  }
};

function parseStoredUser(raw: string): User | null {
  try {
    const parsed = JSON.parse(raw) as User;
    const role = normalizeRole(parsed?.role);
    if (!role) return null;
    return { ...parsed, role };
  } catch {
    return null;
  }
}

const getInitialUser = (): User | null => {
  try {
    const storedUser = localStorage.getItem('user');
    const token = readAccessToken();
    if (storedUser && token) {
      const user = parseStoredUser(storedUser);
      if (!user) {
        localStorage.removeItem('user');
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        return null;
      }
      return user;
    }
  } catch {
    localStorage.removeItem('user');
  }
  return null;
};

export const AuthProvider: React.FC<Props> = ({ children }) => {
  const [user, setUser] = useState<User | null>(getInitialUser);

  useEffect(() => {
    const onSessionExpired = () => setUser(null);
    window.addEventListener(AUTH_SESSION_EXPIRED, onSessionExpired);
    return () => window.removeEventListener(AUTH_SESSION_EXPIRED, onSessionExpired);
  }, []);

  const login = useCallback(async (identifier: string, password: string): Promise<User> => {
    const data = await apiLogin({ identifier, password });
    const role = normalizeRole(data.user?.role);
    if (!role) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
      throw new Error('Your account has an invalid role. Contact support.');
    }
    const user = { ...data.user, role };
    localStorage.setItem('user', JSON.stringify(user));
    setUser(user);
    return user;
  }, []);

  const applySession = useCallback((sessionUser: User, access: string, refresh: string) => {
    const role = normalizeRole(sessionUser?.role);
    if (!role) return;
    const user = { ...sessionUser, role };
    localStorage.setItem('access_token', access);
    localStorage.setItem('refresh_token', refresh);
    localStorage.setItem('user', JSON.stringify(user));
    setUser(user);
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    await apiLogout();
    setUser(null);
    localStorage.removeItem('user');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }, []);

  const updateUser = useCallback((updatedData: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...updatedData };
      localStorage.setItem('user', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const value = useMemo(
    () => ({
      user,
      token: user ? readAccessToken() : null,
      login,
      applySession,
      logout,
      updateUser,
      isAuthenticated: !!user && !!readAccessToken(),
      isAdmin: user?.role === 'admin',
      isSupervisor: user?.role === 'supervisor',
      isInstructor: user?.role === 'instructor',
      isTrainee: user?.role === 'trainee',
    }),
    [user, login, applySession, logout, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
