import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getAdminAdmins,
  getAdminApiLogs,
  getAdminAuditLogs,
  getAdminChartMetrics,
  getAdminCourses,
  getAdminErrorLogs,
  getAdminInstructors,
  getAdminScheduleMeetings,
  getAdminScheduleSessions,
  getAdminSupervisors,
  getAdminTutors,
  getAdminUsers,
  patchAdminUserStatus,
  type UserStatus,
} from '../services/adminPortalService';
import { adminKeys, ADMIN_LIST_STALE_MS, ADMIN_STALE_MS } from '../lib/adminQueryKeys';
import type { UserTab } from '../pages/admin/AdminUsersPage.types';

const userFetchers = {
  all: getAdminUsers,
  supervisor: getAdminSupervisors,
  instructor: getAdminInstructors,
  admin: getAdminAdmins,
} as const;

export function useAdminUsersQuery(
  role: UserTab,
  params: { search?: string; page: number; page_size: number },
) {
  const keyParams = { search: params.search ?? '', page: params.page, page_size: params.page_size };
  return useQuery({
    queryKey: adminKeys.users(role, keyParams),
    queryFn: () => userFetchers[role](params),
    staleTime: ADMIN_LIST_STALE_MS,
    placeholderData: keepPreviousData,
  });
}

export function useAdminUserStatusMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: UserStatus }) =>
      patchAdminUserStatus(userId, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.all });
    },
  });
}

export function useAdminTutorsQuery(params: {
  search?: string;
  page: number;
  page_size: number;
}) {
  const keyParams = { search: params.search ?? '', page: params.page, page_size: params.page_size };
  return useQuery({
    queryKey: adminKeys.tutors(keyParams),
    queryFn: () => getAdminTutors(params),
    staleTime: ADMIN_LIST_STALE_MS,
    placeholderData: keepPreviousData,
  });
}

export function useAdminCoursesQuery(params: {
  search?: string;
  is_published?: boolean;
  page: number;
  page_size: number;
}) {
  const keyParams = {
    search: params.search ?? '',
    published: params.is_published === undefined ? '' : String(params.is_published),
    page: params.page,
    page_size: params.page_size,
  };
  return useQuery({
    queryKey: adminKeys.courses(keyParams),
    queryFn: () => getAdminCourses(params),
    staleTime: ADMIN_LIST_STALE_MS,
    placeholderData: keepPreviousData,
  });
}

export function useAdminScheduleSessionsQuery(params: {
  upcoming?: boolean;
  page: number;
  page_size: number;
}) {
  const keyParams = {
    upcoming: params.upcoming ? '1' : '',
    page: params.page,
    page_size: params.page_size,
  };
  return useQuery({
    queryKey: adminKeys.scheduleSessions(keyParams),
    queryFn: () => getAdminScheduleSessions(params),
    staleTime: ADMIN_LIST_STALE_MS,
    placeholderData: keepPreviousData,
  });
}

export function useAdminScheduleMeetingsQuery(params: {
  upcoming?: boolean;
  page: number;
  page_size: number;
}) {
  const keyParams = {
    upcoming: params.upcoming ? '1' : '',
    page: params.page,
    page_size: params.page_size,
  };
  return useQuery({
    queryKey: adminKeys.scheduleMeetings(keyParams),
    queryFn: () => getAdminScheduleMeetings(params),
    staleTime: ADMIN_LIST_STALE_MS,
    placeholderData: keepPreviousData,
  });
}

export function useAdminLogsQuery(
  logType: 'audit' | 'error' | 'api',
  params: { page: number; page_size: number },
) {
  const fetchers = {
    audit: getAdminAuditLogs,
    error: getAdminErrorLogs,
    api: getAdminApiLogs,
  };
  const keyParams = { page: params.page, page_size: params.page_size };
  return useQuery({
    queryKey: adminKeys.logs(logType, keyParams),
    queryFn: () => fetchers[logType](params),
    staleTime: ADMIN_LIST_STALE_MS,
    placeholderData: keepPreviousData,
  });
}

export function useAdminChartMetricsQuery(days: number, months: number) {
  return useQuery({
    queryKey: adminKeys.chartMetrics(days, months),
    queryFn: () => getAdminChartMetrics({ days, months }),
    staleTime: ADMIN_STALE_MS,
  });
}
