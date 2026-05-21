import { useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';

/** Base path for staff portal routes (`/tutor` or `/admin`). Admins always use `/admin`. */
export function usePortalBasePath(): '/tutor' | '/admin' {
  const { pathname } = useLocation();
  const { user } = useAuth();
  if (user?.role === 'admin') return '/admin';
  return pathname.startsWith('/admin') ? '/admin' : '/tutor';
}

/** Content library prefix for the current user (trainee dashboard vs tutor portal). */
export function useContentLibraryBase(): string {
  const { user } = useAuth();
  const portal = usePortalBasePath();
  if (user?.role === 'trainee') return '/dashboard/learning-materials';
  return `${portal}/library`;
}
