import api from './api';
import type {
  FinalScore,
  IncidentEvent,
  IncidentRun,
  MissionParticipant,
  MissionPhase,
  MissionState,
  MissionStatus,
  StartMissionPayload,
  StartMissionResponse,
  SubmitActionPayload,
  SupervisorIntervention,
} from '../types/incident';

export const startMission = async (
  payload: StartMissionPayload,
): Promise<StartMissionResponse> => {
  const response = await api.post<StartMissionResponse>('/simulations/incidents/', payload);
  return response.data;
};

/** Alias for product UI copy ("Launch Immersive Mission") — same POST as `startMission`. */
export const startMissionRun = startMission;

export const getActiveRuns = async (): Promise<IncidentRun[]> => {
  return listIncidentRuns({ status: 'in_progress' });
};

/** GET /api/simulations/incidents/ — optional filters (e.g. status). */
export const listIncidentRuns = async (params?: {
  status?: MissionStatus;
}): Promise<IncidentRun[]> => {
  const response = await api.get<{ results: IncidentRun[] } | IncidentRun[]>(
    '/simulations/incidents/',
    { params },
  );
  const data = response.data;
  if (Array.isArray(data)) return data;
  if (data && 'results' in data && Array.isArray(data.results)) return data.results;
  return [];
};

/** GET /api/simulations/incidents/{id}/ */
export const getIncidentRun = async (runId: string): Promise<IncidentRun> => {
  const response = await api.get<IncidentRun>(`/simulations/incidents/${runId}/`);
  return response.data;
};

/** GET /api/simulations/incidents/{id}/events/ */
export const getIncidentEvents = async (runId: string): Promise<IncidentEvent[]> => {
  const response = await api.get<IncidentEvent[] | { results: IncidentEvent[] }>(
    `/simulations/incidents/${runId}/events/`,
  );
  const data = response.data;
  if (Array.isArray(data)) return data;
  if (data && 'results' in data && Array.isArray(data.results)) return data.results;
  return [];
};

/** POST /api/simulations/incidents/{id}/join/ */
export const joinMissionRun = async (
  runId: string,
  payload?: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const response = await api.post<Record<string, unknown>>(
    `/simulations/incidents/${runId}/join/`,
    payload ?? {},
  );
  return response.data;
};

export const getMissionState = async (runId: string): Promise<MissionState> => {
  const response = await api.get<MissionState>(`/simulations/incidents/${runId}/state/`);
  return response.data;
};

export const submitAction = async (
  runId: string,
  payload: SubmitActionPayload,
): Promise<{
  event: IncidentEvent;
  current_state: MissionState;
  time_remaining: number;
  score_so_far: number;
}> => {
  const response = await api.post<{
    event: IncidentEvent;
    current_state: MissionState;
    time_remaining: number;
    score_so_far: number;
  }>(`/simulations/incidents/${runId}/actions/`, payload);
  return response.data;
};

export const acknowledgeBriefing = async (
  runId: string,
): Promise<{
  phase: MissionPhase;
  time_remaining: number | null;
  all_ready: boolean;
  briefing_complete?: boolean;
  current_state?: MissionState;
}> => {
  const response = await api.post<{
    phase: MissionPhase;
    time_remaining: number | null;
    all_ready: boolean;
    briefing_complete?: boolean;
    current_state?: MissionState;
  }>(`/simulations/incidents/${runId}/acknowledge/`);
  return response.data;
};

export const requestHint = async (
  runId: string,
): Promise<{ hint: string; hints_used: number; score_penalty: number }> => {
  const response = await api.post<{ hint: string; hints_used: number; score_penalty: number }>(
    `/simulations/incidents/${runId}/actions/`,
    {
      action_type: 'hint_request',
      step_id: 'current',
      decision_data: {},
    } satisfies SubmitActionPayload,
  );
  return response.data;
};

export const abandonMission = async (runId: string): Promise<{ run_id: string; status: string }> => {
  const response = await api.post<{ run_id: string; status: string }>(
    `/simulations/incidents/${runId}/abandon/`,
  );
  return response.data;
};

export const getFinalScore = async (runId: string): Promise<FinalScore> => {
  const response = await api.get<FinalScore>(`/simulations/incidents/${runId}/score/`);
  return response.data;
};

export const getTimeline = async (runId: string): Promise<IncidentEvent[]> => {
  const response = await api.get<IncidentEvent[]>(`/simulations/incidents/${runId}/timeline/`);
  return response.data;
};

export const getParticipants = async (runId: string): Promise<MissionParticipant[]> => {
  const response = await api.get<MissionParticipant[]>(
    `/simulations/incidents/${runId}/participants/`,
  );
  return response.data;
};

export const applyIntervention = async (
  runId: string,
  intervention: SupervisorIntervention,
): Promise<MissionState> => {
  const response = await api.post<MissionState>(
    `/simulations/incidents/${runId}/intervention/`,
    intervention,
  );
  return response.data;
};

