import React, { useCallback, useMemo, useState, type ReactNode } from 'react';
import { AuthContext } from './AuthContext';
import type { User } from '../types/auth';
import { login as apiLogin, logout as apiLogout } from '../services/authService';

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

const getInitialUser = (): User | null => {
  try {
    const storedUser = localStorage.getItem('user');
    const token = readAccessToken();
    if (storedUser && token) {
      return JSON.parse(storedUser);
    }
  } catch {
    localStorage.removeItem('user');
  }
  return null;
};

export const AuthProvider: React.FC<Props> = ({ children }) => {
  const [user, setUser] = useState<User | null>(getInitialUser);

  const login = useCallback(async (identifier: string, password: string): Promise<User> => {
    const data = await apiLogin({ identifier, password });
    setUser(data.user);
    return data.user;
  }, []);

  const applySession = useCallback((sessionUser: User, access: string, refresh: string) => {
    localStorage.setItem('access_token', access);
    localStorage.setItem('refresh_token', refresh);
    localStorage.setItem('user', JSON.stringify(sessionUser));
    setUser(sessionUser);
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
      isAuthenticated: !!user,
      isAdmin: user?.role === 'admin',
      isSupervisor: user?.role === 'supervisor',
      isInstructor: user?.role === 'instructor',
      isTrainee: user?.role === 'trainee',
    }),
    [user, login, applySession, logout, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
