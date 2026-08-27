import api from './api';

export interface AdminUser {
  id: string;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: string;
  status: string;
  is_active: boolean;
  department: string;
  organization: string;
  job_title: string;
  training_level: string;
  email_verified: boolean;
  simulations_completed: number;
  total_score: number;
  accuracy_rate: number;
  created_at: string;
  updated_at: string;
  last_active: string | null;
  last_login: string | null;
}

export interface AdminTutor {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  status: string;
  department: string;
  specialization: string[];
  experience_years: number;
  total_students: number;
  total_sessions: number;
  total_meetings: number;
  average_rating: number;
  created_at: string;
  updated_at: string;
}

export interface AdminCourse {
  id: string;
  title: string;
  description: string;
  threat_focus: string;
  difficulty: number;
  difficulty_label: string;
  is_published: boolean;
  estimated_hours: number;
  passing_threshold: number;
  created_by_email: string | null;
  module_count: number;
  enrollment_count: number;
  created_at: string;
  updated_at: string;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface AdminScheduleResponse {
  teaching_sessions: Record<string, unknown>[];
  meetings: Record<string, unknown>[];
  counts: { teaching_sessions: number; meetings: number };
}

export interface AdminLogsResponse {
  audit?: Record<string, unknown>[];
  error?: Record<string, unknown>[];
  api?: Record<string, unknown>[];
}

export interface ChartMetricsResponse {
  generated_at: string;
  period: { days: number; months: number; start_date?: string; end_date?: string };
  summary: Record<string, number>;
  charts: {
    user_growth: { date: string; count: number }[];
    users_by_role: { role: string; count: number }[];
    users_by_status: { status: string; count: number }[];
    users_by_department: { department: string; count: number }[];
    login_activity: { date: string; count: number }[];
    simulations_by_status: { status: string; count: number }[];
    simulation_performance_trend: {
      period: string;
      avg_score: number;
      completions: number;
      active_learners: number;
    }[];
    enrollments_trend: { period: string; count: number }[];
    courses_by_publish: { label: string; count: number }[];
    certificates_by_level: { level: string; count: number }[];
    certificate_issuance_trend: { period: string; count: number }[];
    errors_by_day: { date: string; count: number }[];
    schedule_upcoming: { teaching_sessions: number; meetings: number };
  };
}

const listParams = (params?: Record<string, string | number | boolean | undefined>) => {
  const clean: Record<string, string> = {};
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') clean[k] = String(v);
    });
  }
  return clean;
};

export const getAdminUsers = async (params?: {
  search?: string;
  status?: string;
  page?: number;
  page_size?: number;
}): Promise<Paginated<AdminUser>> => {
  const res = await api.get<Paginated<AdminUser>>('/core/admin/users/', {
    params: listParams(params),
  });
  return res.data;
};

export const getAdminSupervisors = async (params?: {
  search?: string;
  page?: number;
}): Promise<Paginated<AdminUser>> => {
  const res = await api.get<Paginated<AdminUser>>('/core/admin/supervisors/', {
    params: listParams(params),
  });
  return res.data;
};

export const getAdminInstructors = async (params?: {
  search?: string;
  page?: number;
}): Promise<Paginated<AdminUser>> => {
  const res = await api.get<Paginated<AdminUser>>('/core/admin/instructors/', {
    params: listParams(params),
  });
  return res.data;
};

export const getAdminAdmins = async (params?: {
  search?: string;
  page?: number;
}): Promise<Paginated<AdminUser>> => {
  const res = await api.get<Paginated<AdminUser>>('/core/admin/admins/', {
    params: listParams(params),
  });
  return res.data;
};

export const getAdminTutors = async (params?: {
  search?: string;
  role?: string;
  page?: number;
}): Promise<Paginated<AdminTutor>> => {
  const res = await api.get<Paginated<AdminTutor>>('/core/admin/tutors/', {
    params: listParams(params),
  });
  return res.data;
};

export const getAdminCourses = async (params?: {
  search?: string;
  is_published?: boolean;
  page?: number;
}): Promise<Paginated<AdminCourse>> => {
  const res = await api.get<Paginated<AdminCourse>>('/core/admin/courses/', {
    params: listParams(params),
  });
  return res.data;
};

export const getAdminScheduleSessions = async (params?: {
  from?: string;
  to?: string;
  upcoming?: boolean;
  page?: number;
  page_size?: number;
}): Promise<Paginated<Record<string, unknown>>> => {
  const res = await api.get<Paginated<Record<string, unknown>>>(
    '/core/admin/schedule/sessions/',
    { params: listParams(params) },
  );
  return res.data;
};

export const getAdminScheduleMeetings = async (params?: {
  from?: string;
  to?: string;
  upcoming?: boolean;
  page?: number;
  page_size?: number;
}): Promise<Paginated<Record<string, unknown>>> => {
  const res = await api.get<Paginated<Record<string, unknown>>>(
    '/core/admin/schedule/meetings/',
    { params: listParams(params) },
  );
  return res.data;
};

export const getAdminAuditLogs = async (params?: {
  page?: number;
  page_size?: number;
}): Promise<Paginated<Record<string, unknown>>> => {
  const res = await api.get<Paginated<Record<string, unknown>>>('/core/admin/logs/audit/', {
    params: listParams(params),
  });
  return res.data;
};

export const getAdminErrorLogs = async (params?: {
  page?: number;
  page_size?: number;
}): Promise<Paginated<Record<string, unknown>>> => {
  const res = await api.get<Paginated<Record<string, unknown>>>('/core/admin/logs/errors/', {
    params: listParams(params),
  });
  return res.data;
};

export const getAdminApiLogs = async (params?: {
  page?: number;
  page_size?: number;
}): Promise<Paginated<Record<string, unknown>>> => {
  const res = await api.get<Paginated<Record<string, unknown>>>('/core/admin/logs/api/', {
    params: listParams(params),
  });
  return res.data;
};

export type UserStatus = 'active' | 'inactive' | 'suspended' | 'pending';

export const patchAdminUserStatus = async (
  userId: string,
  body: { status: UserStatus; is_active?: boolean },
): Promise<AdminUser> => {
  const res = await api.patch<AdminUser>(`/core/admin/users/${userId}/status/`, body);
  return res.data;
};

export const getAdminChartMetrics = async (params?: {
  days?: number;
  months?: number;
  start_date?: string;
  end_date?: string;
}): Promise<ChartMetricsResponse> => {
  const res = await api.get<ChartMetricsResponse>('/core/admin/metrics/charts/', {
    params: listParams(params),
  });
  return res.data;
};
