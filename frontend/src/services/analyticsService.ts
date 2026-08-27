// src/services/analyticsService.ts
//
// Matches the Django analytics app endpoints registered under api/analytics/:
//   GET /analytics/dashboard/    -> DashboardStatsView
//   GET /analytics/performance/  -> PerformanceView (UserPerformance)
//   GET /analytics/trends/       -> PerformanceTrendsView
//   GET /analytics/skills/       -> SkillAssessmentsView
//   GET /analytics/learning-path/ -> LearningPathView
//   GET /analytics/comparison/   -> ComparisonView

import api from './api';
import { unwrapList } from '../lib/apiUtils';

// ─── Response types (mirror Django serializers exactly) ───────────────────────

export interface CategoryStat {
  category: string;
  count: number;
  avg_score: number;
}

export interface TrendData {
  dates: string[];
  scores: number[];
  counts: number[];
}

/** Response from GET /analytics/dashboard/ */
export interface AnalyticsDashboard {
  total_simulations: number;
  completed_simulations: number;
  average_score: number;
  total_time: number;           // seconds
  weekly_simulations: number;
  category_stats: CategoryStat[];
  recent_activity: Record<string, unknown>[];
  trend_data: TrendData;
  weak_areas: string[];
  strong_areas: string[];
  recommended_scenarios: string[];
  skill_level: Record<string, unknown>;
}

/** Response from GET /analytics/performance/ (UserPerformanceSerializer) */
export interface UserPerformance {
  id: string;
  user_email: string;
  user_name: string;
  total_simulations: number;
  total_time_spent: number;
  average_score: number;
  average_accuracy: number;
  average_response_time: number;
  category_scores: Record<string, number>;
  threat_type_scores: Record<string, number>;
  learning_curve: number[];
  improvement_rate: number;
  weak_areas: string[];
  strong_areas: string[];
  skill_levels: Record<string, unknown>;
  recommended_scenarios: string[];
  recommended_difficulty: string;
  last_updated: string;
}

/** Response from GET /analytics/trends/ (PerformanceTrendSerializer) */
export interface PerformanceTrend {
  id: string;
  period: 'daily' | 'weekly' | 'monthly';
  date: string;
  simulations_completed: number;
  average_score: number;
  total_time: number;
  improvement: number;
}

/** Response from GET /analytics/skills/ (SkillAssessmentSerializer) */
export interface SkillAssessment {
  id: string;
  skill: string;
  skill_display: string;
  level: number;
  score: number;
  progress: number;
  assessed_at: string;
}

/** Response from GET /analytics/learning-path/ */
export interface LearningPathItem {
  scenario_id: string;
  title: string;
  difficulty: string;
  category: string;
  estimated_time: number;
  reason: string;
}

/** Response from GET /analytics/comparison/ */
export interface ComparisonStats {
  user: { avg_score: number; total_time: number; total_sims: number };
  global: { avg_score: number; avg_time: number };
  peers: { avg_score: number; avg_time: number };
  percentile: number;
}

// ─── API calls ────────────────────────────────────────────────────────────────

export const getAnalyticsDashboard = async (): Promise<AnalyticsDashboard> => {
  const response = await api.get<AnalyticsDashboard>('/analytics/dashboard/');
  return response.data;
};

export const getUserPerformance = async (): Promise<UserPerformance> => {
  const response = await api.get<UserPerformance>('/analytics/performance/');
  return response.data;
};

export const getPerformanceTrends = async (params?: {
  period?: 'daily' | 'weekly' | 'monthly';
  days?: number;
}): Promise<PerformanceTrend[]> => {
  const response = await api.get<PerformanceTrend[] | { results: PerformanceTrend[] }>(
    '/analytics/trends/',
    { params },
  );
  return unwrapList(response.data);
};

export const getSkillAssessments = async (): Promise<SkillAssessment[]> => {
  const response = await api.get<SkillAssessment[] | { results: SkillAssessment[] }>(
    '/analytics/skills/',
  );
  return unwrapList(response.data);
};

export const getLearningPath = async (): Promise<LearningPathItem[]> => {
  const response = await api.get<LearningPathItem[] | { results: LearningPathItem[] }>(
    '/analytics/learning-path/',
  );
  return unwrapList(response.data);
};

export const getComparisonStats = async (): Promise<ComparisonStats> => {
  const response = await api.get<ComparisonStats>('/analytics/comparison/');
  return response.data;
};

// ─── Platform analytics (admin / supervisor / instructor) ───────────────────

export interface PlatformMetricsPeriod {
  all_time?: boolean;
  days?: number;
  custom?: boolean;
  snapshot?: boolean;
  start_date?: string;
  end_date?: string;
}

export type PlatformMetricsRange =
  | { days: number }
  | { start_date: string; end_date: string };

const platformRangeParams = (range?: PlatformMetricsRange) => {
  if (!range) return undefined;
  if ('start_date' in range) {
    return { start_date: range.start_date, end_date: range.end_date };
  }
  return { days: range.days };
};

export interface PlatformOverview {
  generated_at: string;
  period?: PlatformMetricsPeriod;
  users: {
    total: number;
    active: number;
    inactive: number;
    by_role: { trainee: number; supervisor: number; instructor: number; admin: number };
    new_last_7_days?: number;
    new_last_30_days?: number;
    new_in_period?: number;
  };
  simulations: {
    total_sessions: number;
    completed: number;
    failed: number;
    abandoned: number;
    avg_score: number;
    active_learners_30d?: number;
    active_learners?: number;
  };
  certificates: { total_issued: number; last_30_days?: number; in_period?: number };
}

export interface PlatformUserAnalytics {
  period?: PlatformMetricsPeriod;
  period_days: number;
  registration_trend: { date: string; count: number }[];
  login_trend: { date: string; count: number }[];
  by_department: { department: string; count: number }[];
}

export interface PlatformPerformanceTrendRow {
  period: string | null;
  avg_score: number;
  completions: number;
  active_learners: number;
  avg_sessions_per_user: number;
}

export interface PlatformCertificationAnalytics {
  period?: PlatformMetricsPeriod;
  total_issued: number;
  by_course_difficulty: { difficulty: number; level: string; count: number }[];
  issuance_trend: { period: string | null; count: number }[];
  leaderboard: { email: string; certificates: number }[];
}

export interface PlatformRetryAnalytics {
  period?: PlatformMetricsPeriod;
  total_sessions: number;
  scenarios_with_retries: number;
  failed_sessions: number;
  avg_attempt_number: number;
}

export const getPlatformOverview = async (
  range?: PlatformMetricsRange,
): Promise<PlatformOverview> => {
  const response = await api.get<PlatformOverview>('/analytics/platform/overview/', {
    params: platformRangeParams(range),
  });
  return response.data;
};

export const getPlatformUserAnalytics = async (
  range: PlatformMetricsRange,
): Promise<PlatformUserAnalytics> => {
  const response = await api.get<PlatformUserAnalytics>('/analytics/platform/users/', {
    params: platformRangeParams(range),
  });
  return response.data;
};

export const getPlatformPerformanceTrends = async (
  range: PlatformMetricsRange = { days: 180 },
): Promise<{ trends: PlatformPerformanceTrendRow[]; period?: PlatformMetricsPeriod }> => {
  const response = await api.get<{ trends: PlatformPerformanceTrendRow[]; period?: PlatformMetricsPeriod }>(
    '/analytics/platform/performance-trends/',
    { params: platformRangeParams(range) },
  );
  return response.data;
};

export const getPlatformCertificationAnalytics = async (
  range?: PlatformMetricsRange,
): Promise<PlatformCertificationAnalytics> => {
  const response = await api.get<PlatformCertificationAnalytics>(
    '/analytics/platform/certifications/',
    { params: platformRangeParams(range) },
  );
  return response.data;
};

export const getPlatformRetryAnalytics = async (
  range?: PlatformMetricsRange,
): Promise<PlatformRetryAnalytics> => {
  const response = await api.get<PlatformRetryAnalytics>('/analytics/platform/retries/', {
    params: platformRangeParams(range),
  });
  return response.data;
};