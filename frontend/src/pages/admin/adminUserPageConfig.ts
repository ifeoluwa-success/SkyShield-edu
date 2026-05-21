import type { UserTab } from './AdminUsersPage.types';

export type { UserTab };

export const TAB_LABELS: Record<UserTab, string> = {
  all: 'All users',
  supervisor: 'Supervisors',
  instructor: 'Instructors',
  admin: 'Admins',
};

export const PAGE_META: Record<
  UserTab,
  { title: string; subtitle: string; sidebarLabel: string }
> = {
  all: {
    title: 'All users',
    subtitle: 'Complete platform user directory',
    sidebarLabel: 'All Users',
  },
  supervisor: {
    title: 'All supervisors',
    subtitle: 'Supervisor accounts across the platform',
    sidebarLabel: 'All Supervisors',
  },
  instructor: {
    title: 'All instructors',
    subtitle: 'Instructor accounts across the platform',
    sidebarLabel: 'All Instructors',
  },
  admin: {
    title: 'All admins',
    subtitle: 'Administrator accounts',
    sidebarLabel: 'All Admins',
  },
};

/** Map admin route segment to fixed user tab (undefined = all users with tabs). */
export function userTabFromPathname(pathname: string): UserTab | undefined {
  if (pathname.includes('/admin/supervisors')) return 'supervisor';
  if (pathname.includes('/admin/instructors')) return 'instructor';
  if (pathname.includes('/admin/admins') && !pathname.includes('/admin/users')) return 'admin';
  return undefined;
}
