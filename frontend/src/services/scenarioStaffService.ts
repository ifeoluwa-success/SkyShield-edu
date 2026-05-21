import api from './api';
import { unwrapList } from '../lib/apiUtils';

export type ScenarioPublishStatus = 'draft' | 'active' | 'archived';

export interface StaffScenario {
  id: string;
  title: string;
  category: string;
  threat_type: string;
  difficulty: string;
  publish_status: ScenarioPublishStatus;
  is_active: boolean;
  is_featured: boolean;
  max_attempts: number;
  times_completed: number;
  average_score: number;
  estimated_time: number;
  assignment_count?: number;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScenarioWritePayload {
  title: string;
  description: string;
  category: string;
  threat_type: string;
  difficulty: string;
  estimated_time?: number;
  points_possible?: number;
  passing_score?: number;
  max_attempts?: number;
  publish_status?: ScenarioPublishStatus;
  steps?: Record<string, unknown>[];
  hints?: string[];
  learning_objectives?: string[];
  tags?: string[];
}

export interface ScenarioAssignment {
  id: string;
  scenario: string;
  scenario_title: string;
  trainee: string;
  trainee_email: string;
  trainee_name: string;
  max_attempts: number | null;
  effective_max_attempts: number;
  cooldown_hours: number;
  status: string;
  attempts_used: number;
  due_at: string | null;
  notes: string;
}

export interface ScenarioPerformance {
  scenario_id: string;
  title: string;
  sessions: {
    total: number;
    completed: number;
    failed: number;
    abandoned: number;
    avg_score: number | null;
  };
  assignments: number;
  active_assignments: number;
}

export const listStaffScenarios = async (params?: {
  publish_status?: ScenarioPublishStatus;
  search?: string;
}): Promise<StaffScenario[]> => {
  const res = await api.get<StaffScenario[] | { results: StaffScenario[] }>(
    '/simulations/staff/scenarios/',
    { params },
  );
  return unwrapList(res.data);
};

export const createStaffScenario = async (
  payload: ScenarioWritePayload,
): Promise<StaffScenario> => {
  const res = await api.post<StaffScenario>('/simulations/staff/scenarios/', payload);
  return res.data;
};

export const updateStaffScenario = async (
  id: string,
  payload: Partial<ScenarioWritePayload>,
): Promise<StaffScenario> => {
  const res = await api.patch<StaffScenario>(`/simulations/staff/scenarios/${id}/`, payload);
  return res.data;
};

export const deleteStaffScenario = async (id: string): Promise<{ message?: string }> => {
  const res = await api.delete<{ message?: string }>(`/simulations/staff/scenarios/${id}/`);
  return res.data;
};

export const duplicateStaffScenario = async (
  id: string,
  title?: string,
): Promise<unknown> => {
  const res = await api.post(`/simulations/staff/scenarios/${id}/duplicate/`, { title });
  return res.data;
};

export const assignScenario = async (
  id: string,
  body: {
    trainee_ids: string[];
    max_attempts?: number;
    cooldown_hours?: number;
    due_at?: string;
    notes?: string;
  },
): Promise<{ assigned: number; updated: number; assignments: ScenarioAssignment[] }> => {
  const res = await api.post(`/simulations/staff/scenarios/${id}/assign/`, body);
  return res.data;
};

export const getScenarioAssignments = async (
  id: string,
): Promise<ScenarioAssignment[]> => {
  const res = await api.get<ScenarioAssignment[] | { results: ScenarioAssignment[] }>(
    `/simulations/staff/scenarios/${id}/assignments/`,
  );
  return unwrapList(res.data);
};

export const getScenarioPerformance = async (id: string): Promise<ScenarioPerformance> => {
  const res = await api.get<ScenarioPerformance>(
    `/simulations/staff/scenarios/${id}/performance/`,
  );
  return res.data;
};

export const revokeScenarioAssignment = async (assignmentId: string): Promise<ScenarioAssignment> => {
  const res = await api.post<ScenarioAssignment>(
    `/simulations/scenario-assignments/${assignmentId}/revoke/`,
  );
  return res.data;
};
