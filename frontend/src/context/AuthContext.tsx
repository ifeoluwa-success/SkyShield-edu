// src/context/AuthContext.tsx
import { createContext } from 'react';
import type { User } from '../types/auth';

export interface AuthContextType {
  user: User | null;
  /** JWT access token from localStorage when a user session exists; refreshes on each render if logged in. */
  token: string | null;
  login: (identifier: string, password: string) => Promise<User>;
  applySession: (user: User, access: string, refresh: string) => void;
  logout: () => Promise<void>;
  updateUser: (updatedData: Partial<User>) => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSupervisor: boolean;
  isInstructor: boolean;
  isTrainee: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);