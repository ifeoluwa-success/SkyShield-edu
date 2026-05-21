import type { UserRole } from '../types/auth';

export const VALID_ROLES: UserRole[] = ['trainee', 'supervisor', 'admin', 'instructor'];

const TUTOR_ROLES: UserRole[] = ['supervisor', 'admin', 'instructor'];

/** Normalize API/localStorage role strings (handles casing and unknown values). */
export function normalizeRole(role: unknown): UserRole | null {
  if (typeof role !== 'string') return null;
  const value = role.toLowerCase().trim() as UserRole;
  return VALID_ROLES.includes(value) ? value : null;
}

/** Default post-login / post-auth home for each role. */
export function getHomePathForRole(role: UserRole): string {
  switch (role) {
    case 'admin':
      return '/admin/metrics';
    case 'supervisor':
    case 'instructor':
      return '/tutor/dashboard';
    case 'trainee':
    default:
      return '/dashboard';
  }
}

/** Whether a role may access a protected route prefix. */
export function canAccessPath(role: UserRole, pathname: string): boolean {
  if (pathname.startsWith('/admin')) return role === 'admin';
  if (pathname.startsWith('/tutor')) return TUTOR_ROLES.includes(role);
  if (pathname.startsWith('/dashboard')) return role === 'trainee';
  return true;
}

export function isTutorRole(role: UserRole): boolean {
  return TUTOR_ROLES.includes(role);
}
