import api from './api';
import type {
  Scenario,
  SimulationSession,
  SimulationSessionDetail,
  ScenarioWithSteps,
  SubmitDecisionRequest,
  HintRequest,
  ScenarioComment,
  CreateCommentRequest,
  UpdateCommentRequest,
} from '../types/simulation';
import type {
  GenieGenerateRequest,
  GenieStatusResponse,
  GenieVariationRequest,
} from '../types/incident';
import type { Meeting } from '../types/tutor';

// ─── Scenarios ────────────────────────────────────────────────────────────────

export const getScenarios = async (params?: {
  category?: string;
  difficulty?: string;
  threat_type?: string;
  search?: string;
  featured?: boolean;
}): Promise<Scenario[]> => {
  const response = await api.get<{ results: Scenario[] }>('/simulations/scenarios/', { params });
  return response.data.results;
};

export const getScenario = async (id: string): Promise<ScenarioWithSteps> => {
  const response = await api.get<ScenarioWithSteps>(`/simulations/scenarios/${id}/`);
  return response.data;
};

export const getRecommendedScenarios = async (): Promise<Scenario[]> => {
  const response = await api.get<Scenario[]>('/simulations/scenarios/recommended/');
  return response.data;
};

export const bookmarkScenario = async (id: string): Promise<{ bookmarked: boolean }> => {
  const response = await api.post<{ bookmarked: boolean }>(
    `/simulations/scenarios/${id}/bookmark/`,
  );
  return response.data;
};

export const getBookmarkedScenarios = async (): Promise<Scenario[]> => {
  const response = await api.get<Scenario[]>('/simulations/scenarios/bookmarks/');
  return response.data;
};

// ─── Scenario Comments ───────────────────────────────────────────────────────

export const getScenarioComments = async (scenarioId: string): Promise<ScenarioComment[]> => {
  const response = await api.get<ScenarioComment[]>(`/simulations/scenarios/${scenarioId}/comments/`);
  return response.data;
};

export const createScenarioComment = async (
  scenarioId: string,
  data: CreateCommentRequest,
): Promise<ScenarioComment> => {
  const response = await api.post<ScenarioComment>(`/simulations/scenarios/${scenarioId}/comments/`, data);
  return response.data;
};

export const updateScenarioComment = async (
  scenarioId: string,
  commentId: string,
  data: UpdateCommentRequest,
): Promise<ScenarioComment> => {
  const response = await api.put<ScenarioComment>(
    `/simulations/scenarios/${scenarioId}/comments/${commentId}/`,
    data,
  );
  return response.data;
};

export const deleteScenarioComment = async (scenarioId: string, commentId: string): Promise<void> => {
  await api.delete(`/simulations/scenarios/${scenarioId}/comments/${commentId}/`);
};

// ─── Simulation Sessions ──────────────────────────────────────────────────────

export const startSimulation = async (scenarioId: string): Promise<SimulationSession> => {
  const response = await api.post<SimulationSession>('/simulations/sessions/start/', {
    scenario_id: scenarioId,
  });
  return response.data;
};

export const getSession = async (sessionId: string): Promise<SimulationSessionDetail> => {
  const response = await api.get<SimulationSessionDetail>(`/simulations/sessions/${sessionId}/`);
  return response.data;
};

export const getCurrentSession = async (
  scenarioId?: string,
): Promise<SimulationSession | null> => {
  const params = scenarioId ? { scenario_id: scenarioId } : {};
  const response = await api.get<
    SimulationSession[] | { results: SimulationSession[] }
  >('/simulations/sessions/', { params });
  const data = response.data;
  const list: SimulationSession[] = Array.isArray(data)
    ? data
    : data && 'results' in data && Array.isArray(data.results)
      ? data.results
      : [];
  const inProgress = list.find(s => s.status === 'in_progress');
  return inProgress ?? list[0] ?? null;
};

/**
 * Fetch all simulation sessions for the current user.
 * Handles both a bare array and a paginated `{ results: [] }` response.
 */
export const getAllSessions = async (): Promise<SimulationSession[]> => {
  const response = await api.get<
    SimulationSession[] | { results: SimulationSession[] }
  >('/simulations/sessions/');
  const data = response.data;
  if (Array.isArray(data)) return data;
  if (data && 'results' in data && Array.isArray(data.results)) return data.results;
  return [];
};

// ─── Submit decision ──────────────────────────────────────────────────────────

interface SubmitDecisionResponse {
  correct: boolean;
  feedback: Record<string, unknown>;
  next_step?: {
    number: number;
    title: string;
    description: string;
    options: unknown[];
  };
  session: SimulationSession;
  completed?: boolean;
  score?: number;
  passed?: boolean;
  summary?: {
    total_steps: number;
    correct_decisions: number;
    incorrect_decisions: number;
    accuracy: number;
    time_spent: number;
    average_time_per_decision: number;
    hints_used: number;
    challenging_steps: Array<{
      step: number;
      time_taken: number;
      was_correct: boolean;
    }>;
    score: number;
    passed: boolean;
  };
}

export const submitDecision = async (
  data: SubmitDecisionRequest,
): Promise<SubmitDecisionResponse> => {
  const response = await api.post<SubmitDecisionResponse>(
    '/simulations/sessions/submit_decision/',
    data,
  );
  return response.data;
};

export const requestHint = async (
  data: HintRequest,
): Promise<{ hint: string; hints_used: number; hints_remaining: number }> => {
  const response = await api.post<{
    hint: string;
    hints_used: number;
    hints_remaining: number;
  }>('/simulations/sessions/request_hint/', data);
  return response.data;
};

export const abandonSimulation = async (sessionId: string): Promise<void> => {
  await api.post(`/simulations/sessions/${sessionId}/abandon/`);
};

export const getSessionHistory = async (
  sessionId: string,
): Promise<{ session: SimulationSession; decisions: unknown[] }> => {
  const response = await api.get(`/simulations/sessions/${sessionId}/history/`);
  return response.data as { session: SimulationSession; decisions: unknown[] };
};

// ─── Achievements ─────────────────────────────────────────────────────────────

export interface Achievement {
  id: string;
  user: string;
  scenario: string;
  scenario_title: string;
  achievement_type: string;
  achievement_type_display: string;
  earned_at: string;
}

export const getAchievements = async (): Promise<Achievement[]> => {
  const response = await api.get<Achievement[]>('/simulations/achievements/');
  return response.data;
};

export const getAchievementStats = async (): Promise<{
  total: number;
  by_type: Record<string, number>;
  recent: Achievement[];
}> => {
  const response = await api.get<{
    total: number;
    by_type: Record<string, number>;
    recent: Achievement[];
  }>('/simulations/achievements/stats/');
  return response.data;
};

// ─── Feedback ─────────────────────────────────────────────────────────────────

export interface ScenarioFeedback {
  id: string;
  user: string;
  scenario: string;
  rating: number;
  rating_display: string;
  difficulty_rating: number;
  difficulty_rating_display: string;
  comments: string;
  created_at: string;
}

export const submitScenarioFeedback = async (
  scenarioId: string,
  rating: number,
  difficultyRating: number,
  comments: string,
): Promise<ScenarioFeedback> => {
  const response = await api.post<ScenarioFeedback>('/simulations/feedback/', {
    scenario: scenarioId,
    rating,
    difficulty_rating: difficultyRating,
    comments,
  });
  return response.data;
};

export const getScenarioFeedback = async (
  scenarioId: string,
): Promise<ScenarioFeedback | null> => {
  const response = await api.get<{ feedback: ScenarioFeedback | null }>(
    `/simulations/feedback/?scenario=${scenarioId}`,
  );
  return response.data.feedback;
};

// ─── Certifications ───────────────────────────────────────────────────────────

export interface Certification {
  id: string;
  title: string;
  level: 'Basic' | 'Intermediate' | 'Advanced' | 'Expert';
  category: string;
  progress: number;
  status: 'completed' | 'in-progress' | 'locked' | 'available';
  score?: number;
  duration: string;
  modules: number;
  completedModules: number;
  expirationDate?: string;
  issuedDate?: string;
  description: string;
  icon: string;
  color: string;
  requirements: string[];
}

export const getUserCertifications = async (): Promise<Certification[]> => {
  const response = await api.get<Certification[]>('/simulations/certifications/');
  return response.data;
};

// ─── Learning Materials ───────────────────────────────────────────────────────

export interface LearningMaterial {
  id: string;
  title: string;
  description: string;
  material_type: string;
  material_type_display?: string;
  difficulty: string;
  difficulty_display?: string;
  file_url?: string;
  video_url?: string;
  estimated_read_time?: number;
  created_at: string;
}

export const getMyLearningMaterials = async (): Promise<LearningMaterial[]> => {
  const response = await api.get<LearningMaterial[] | { results: LearningMaterial[] }>(
    '/content/materials/',
    { params: { limit: 50 } },
  );
  const data = response.data;
  if (Array.isArray(data)) return data;
  if (data && 'results' in data) return data.results;
  return [];
};

// ─── Upcoming Live Sessions ───────────────────────────────────────────────────

export interface UpcomingSession {
  id: string;
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  session_type?: string;
  max_attendees?: number;
  join_link?: string;
  duration_minutes?: number;
}

export const getMyUpcomingSessions = async (): Promise<UpcomingSession[]> => {
  const response = await api.get<{ results: Meeting[] }>('/meetings/meetings/', {
    params: { status: 'scheduled', limit: 20 },
  });
  return response.data.results.map(meeting => ({
    id: meeting.id,
    title: meeting.title,
    description: meeting.description,
    start_time: meeting.scheduled_start,
    end_time: meeting.scheduled_end,
    session_type: meeting.meeting_type,
    max_attendees: meeting.max_participants,
    join_link: `/meetings/join/${meeting.meeting_code}`,
    duration_minutes: meeting.scheduled_end
      ? Math.round(
          (new Date(meeting.scheduled_end).getTime() -
            new Date(meeting.scheduled_start).getTime()) /
            60_000,
        )
      : 60,
  }));
};

// ─── Exercises ────────────────────────────────────────────────────────────────

export interface AssignedExercise {
  id: string;
  title: string;
  description: string;
  exercise_type: string;
  time_limit_minutes: number;
  passing_score: number;
  max_attempts: number;
  due_date?: string;
  status: 'pending' | 'in_progress' | 'completed';
  score?: number;
}

export const hasAssignedExercises = async (): Promise<boolean> => {
  const response = await api.get<{ has_exercises: boolean }>(
    '/tutor/trainee/exercises/status/',
  );
  return response.data.has_exercises;
};

export const getAssignedExercises = async (): Promise<AssignedExercise[]> => {
  const response = await api.get<AssignedExercise[]>('/tutor/trainee/exercises/');
  return response.data;
};

export const submitExerciseAttempt = async (
  exerciseId: string,
  answers: Record<string, unknown>,
): Promise<{ score: number; passed: boolean; feedback: string }> => {
  const response = await api.post<{ score: number; passed: boolean; feedback: string }>(
    '/tutor/trainee/exercises/submit/',
    { exercise_id: exerciseId, answers },
  );
  return response.data;
};

// ─── Incident missions (REST) — re-exported for /simulations/ API parity ──────

export {
  abandonMission,
  acknowledgeBriefing,
  applyIntervention,
  getActiveRuns,
  getFinalScore,
  getIncidentEvents,
  getIncidentRun,
  getMissionState,
  getParticipants,
  getTimeline,
  joinMissionRun,
  listIncidentRuns,
  startMission,
  submitAction,
} from './incidentService';

/** Mission incident hint (POST …/incidents/…/actions/). Distinct from session `requestHint` above. */
export { requestHint as requestMissionHint } from './incidentService';

// ─── Genie (AI scenario generation) ───────────────────────────────────────────

export const generateGenieScenario = async (
  payload: GenieGenerateRequest,
): Promise<Record<string, unknown>> => {
  const response = await api.post<Record<string, unknown>>(
    '/simulations/genie/generate/',
    payload,
  );
  return response.data;
};

export const generateGenieVariation = async (
  payload: GenieVariationRequest,
): Promise<Record<string, unknown>> => {
  const response = await api.post<Record<string, unknown>>(
    '/simulations/genie/variation/',
    payload,
  );
  return response.data;
};

export const getGenieStatus = async (): Promise<GenieStatusResponse> => {
  const response = await api.get<GenieStatusResponse>('/simulations/genie/status/');
  return response.data;
};