export type MissionPhase =
  | 'briefing'
  | 'detection'
  | 'investigation'
  | 'containment'
  | 'recovery'
  | 'review';

export type MissionStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'abandoned'
  | 'paused';

export type OperatorRole = 'lead_operator' | 'support_operator' | 'observer' | 'supervisor';

export type EventType =
  | 'action_submitted'
  | 'phase_changed'
  | 'escalation_triggered'
  | 'hint_requested'
  | 'intervention_applied'
  | 'participant_joined'
  | 'participant_left'
  | 'timeout_occurred'
  | 'system';

export type InterventionType =
  | 'INJECT_THREAT'
  | 'PAUSE'
  | 'FORCE_PHASE'
  | 'OVERRIDE_DECISION'
  | 'REDUCE_TIMER';

export interface MissionParticipant {
  id: string;
  username: string;
  email: string;
  role: OperatorRole;
  joined_at: string;
  is_active: boolean;
  is_ready: boolean;
}

export interface IncidentEvent {
  id: string;
  run: string;
  event_type: EventType;
  actor_username: string | null;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface ThreatNode {
  id: string;
  label: string;
  severity: 1 | 2 | 3 | 4 | 5;
  phase: string;
  trigger_condition: Record<string, unknown>;
  consequence_payload: Record<string, unknown>;
}

export interface IncidentRun {
  id: string;
  scenario: {
    id: string;
    title: string;
    description: string;
    threat_type: string;
    difficulty: number;
    steps: ScenarioStep[];
    hints: Record<string, string>;
    passing_score: number;
    points_possible: number;
  };
  phase: MissionPhase;
  status: MissionStatus;
  session_state: Record<string, unknown>;
  phase_started_at: string | null;
  started_at: string;
  completed_at: string | null;
  score: number | null;
  passed: boolean | null;
  is_genie_generated: boolean;
  time_remaining: number | null;
  participant_count: number;
}

export interface ScenarioStep {
  step_id: string;
  phase: MissionPhase;
  description: string;
  points_value: number;
  time_limit_seconds: number;
  options: StepOption[];
  correct_action: string;
  hint: string;
}

export interface StepOption {
  id: string;
  text: string;
  is_correct: boolean;
  consequence: string;
  escalation_trigger: boolean;
}

export interface MissionState {
  run: IncidentRun;
  phase: MissionPhase;
  status: MissionStatus;
  time_remaining: number | null;
  participants: MissionParticipant[];
  last_5_events: IncidentEvent[];
  score_so_far: number;
  active_threats: ThreatNode[];
  /** 0-based cursor from orchestrator — authoritative for which scenario step is active */
  current_step?: number;
  steps_completed?: number;
  total_steps?: number;
  phase_step_indices?: number[];
}

export interface StartMissionPayload {
  scenario_id: string;
  use_genie?: boolean;
  operator_role?: OperatorRole;
}

export interface StartMissionResponse {
  run_id: string;
  briefing_narrative: string;
  time_limits: Record<string, number>;
  first_step: ScenarioStep | null;
  ws_url: string;
}

export interface SubmitActionPayload {
  action_type: string;
  step_id: string;
  decision_data: Record<string, unknown>;
  timestamp_client?: number;
}

export interface FinalScore {
  score: number;
  passed: boolean;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  breakdown: {
    accuracy_score: number;
    time_bonus: number;
    hint_penalty: number;
    escalation_penalty: number;
    decisions_correct: number;
    decisions_total: number;
  };
}

export interface SupervisorIntervention {
  type: InterventionType;
  data?: {
    label?: string;
    severity?: number;
    target_phase?: MissionPhase;
    is_correct?: boolean;
  };
}

/** POST /api/simulations/genie/generate/ */
export interface GenieGenerateRequest {
  prompt?: string;
  difficulty?: number;
  threat_focus?: string;
}

/** POST /api/simulations/genie/variation/ */
export interface GenieVariationRequest {
  scenario_id: string;
  variation_hint?: string;
}

/** GET /api/simulations/genie/status/ */
export interface GenieStatusResponse {
  available?: boolean;
  ok?: boolean;
  provider?: string;
  model?: string;
  message?: string;
  error?: string | null;
}

