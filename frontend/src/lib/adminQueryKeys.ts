export const ADMIN_STALE_MS = 5 * 60_000;
export const ADMIN_LIST_STALE_MS = 2 * 60_000;

export const adminKeys = {
  all: ['admin'] as const,
  chartMetrics: (days: number, months: number, startDate = '', endDate = '') =>
    [...adminKeys.all, 'chartMetrics', days, months, startDate, endDate] as const,
  dashboardBundle: (periodDays: number, trendMonths: number, chartDays: number) =>
    [...adminKeys.all, 'dashboardBundle', periodDays, trendMonths, chartDays] as const,
  users: (role: string, params: Record<string, string | number>) =>
    [...adminKeys.all, 'users', role, params] as const,
  tutors: (params: Record<string, string | number>) =>
    [...adminKeys.all, 'tutors', params] as const,
  courses: (params: Record<string, string | number>) =>
    [...adminKeys.all, 'courses', params] as const,
  scheduleSessions: (params: Record<string, string | number | boolean>) =>
    [...adminKeys.all, 'scheduleSessions', params] as const,
  scheduleMeetings: (params: Record<string, string | number | boolean>) =>
    [...adminKeys.all, 'scheduleMeetings', params] as const,
  logs: (type: string, params: Record<string, string | number>) =>
    [...adminKeys.all, 'logs', type, params] as const,
};
