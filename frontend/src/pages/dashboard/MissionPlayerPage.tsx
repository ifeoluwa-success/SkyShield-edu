import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation, useSearchParams } from 'react-router-dom';
import { AxiosError } from 'axios';
import { Copy, Link2, LogOut, Radio, ShieldAlert, Users } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useMissionSocket, type MissionConnectionStatus } from '../../hooks/useMissionSocket';
import type { FinalScore, IncidentEvent, MissionPhase, MissionParticipant, MissionState, ScenarioStep } from '../../types/incident';
import type { User } from '../../types/auth';
import {
  abandonMission,
  acknowledgeBriefing,
  getFinalScore,
  getMissionState,
  getParticipants,
  joinMissionRun,
  requestHint,
  submitAction,
} from '../../services/incidentService';
import { refreshToken } from '../../services/authService';
import { BriefingScreen } from '../../components/mission/BriefingScreen';
import { PhaseBar } from '../../components/mission/PhaseBar';
import { RadarScope } from '../../components/mission/RadarScope';
import { OpsDashboard } from '../../components/mission/OpsDashboard';
import { StressHUD } from '../../components/mission/StressHUD';
import { DecisionPanel } from '../../components/mission/DecisionPanel';
import { EventFeed } from '../../components/mission/EventFeed';
import { ParticipantBadges } from '../../components/mission/ParticipantBadges';
import { ReviewScreen } from '../../components/mission/ReviewScreen';
import Toast from '../../components/Toast';
import { Spinner } from '../../components/ui/Loading';
import '../../assets/css/MissionPlayerPage.css';

const phaseOrder: MissionPhase[] = [
  'briefing',
  'detection',
  'investigation',
  'containment',
  'recovery',
  'review',
];

type PreflightStatus = 'idle' | 'checking' | 'joining' | 'ready' | 'error';

const norm = (s: string | undefined) => (s ?? '').trim().toLowerCase();

function userIsParticipant(participants: MissionParticipant[], user: User): boolean {
  const email = norm(user.email);
  const uname = norm(user.username);
  return participants.some(p => norm(p.email) === email || norm(p.username) === uname);
}

/** Radar (ATC-style) vs operations console — maps backend / product roles. */
const getOperatorMode = (role: string | undefined, jobTitle: string | undefined) => {
  const r = (role ?? '').toLowerCase();
  const j = (jobTitle ?? '').toLowerCase();
  if (r === 'operations_officer' || r === 'support_operator') return 'ops';
  if (j.includes('operation') || /\bops\b/.test(j)) return 'ops';
  if (j.includes('air traffic') || j.includes('atc')) return 'atc';
  return 'atc';
};

function phaseRank(p: MissionPhase | undefined): number {
  if (!p) return -1;
  const i = phaseOrder.indexOf(p);
  return i >= 0 ? i : -1;
}

/** When REST and WS disagree, trust the more advanced phase so late-game / review is not stuck on an old phase. */
function pickMoreAdvancedPhase(a: MissionPhase | undefined, b: MissionPhase | undefined): MissionPhase {
  const ra = phaseRank(a);
  const rb = phaseRank(b);
  if (rb > ra) return b ?? a ?? 'briefing';
  if (ra > rb) return a ?? b ?? 'briefing';
  return (a ?? b ?? 'briefing') as MissionPhase;
}

const OPERATIONAL_PHASES: MissionPhase[] = ['detection', 'investigation', 'containment', 'recovery'];

function parseStepIndex(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.floor(v);
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return undefined;
}

/** Backend step rows use `id` + `description`; normalize to `ScenarioStep` shape for the panel. */
function materializeScenarioStep(raw: unknown, fallbackPhase: MissionPhase): ScenarioStep | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const step_id = String(r.step_id ?? r.id ?? '').trim();
  if (!step_id) return null;
  const options = Array.isArray(r.options) ? (r.options as ScenarioStep['options']) : [];
  return {
    step_id,
    phase: (r.phase ?? r.mission_phase ?? fallbackPhase) as MissionPhase,
    description: String(r.description ?? r.narrative ?? r.question ?? ''),
    points_value: Number(r.points_value ?? r.points ?? 10),
    time_limit_seconds: Number(r.time_limit_seconds ?? 60),
    options,
    correct_action: String(r.correct_action ?? ''),
    hint: String(r.hint ?? ''),
  };
}

/** Step index for mission cursor — matches orchestrator `current_step` (0-based). */
function readActiveStepIndex(state: MissionState | null): number | undefined {
  if (!state) return undefined;
  const root = state as unknown as Record<string, unknown>;
  const session = (state.run.session_state ?? {}) as Record<string, unknown>;
  const runRoot = state.run as unknown as Record<string, unknown>;
  return (
    parseStepIndex(root.current_step) ??
    parseStepIndex(session.current_step) ??
    parseStepIndex(runRoot.current_step)
  );
}

/**
 * Resolve the active scenario step from merged `missionState`.
 * The mission engine advances `session_state.current_step` (0-based index); step id strings
 * are stable labels (e.g. adsb-01) and must not be used alone to pick the active row.
 */
const extractCurrentStep = (state: MissionState | null): ScenarioStep | null => {
  if (!state?.run?.scenario?.steps?.length) return null;

  const steps = state.run.scenario.steps;
  const session = (state.run.session_state ?? {}) as Record<string, unknown>;
  const root = state as unknown as Record<string, unknown>;
  const runRoot = state.run as unknown as Record<string, unknown>;

  const rawPhase = (state.phase ?? state.run?.phase ?? 'briefing') as string;
  const canonicalPhase = (phaseOrder.includes(rawPhase as MissionPhase) ? rawPhase : 'briefing') as MissionPhase;
  if (canonicalPhase === 'briefing' || canonicalPhase === 'review') return null;

  const stepIndex = readActiveStepIndex(state);
  if (stepIndex !== undefined && stepIndex < steps.length) {
    const byIndex = materializeScenarioStep(steps[stepIndex], canonicalPhase);
    if (byIndex) return byIndex;
  }

  const toStepId = (v: unknown): string | undefined => {
    if (v === null || v === undefined) return undefined;
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    return undefined;
  };

  const currentStepObj =
    session.current_step && typeof session.current_step === 'object' && !Array.isArray(session.current_step)
      ? (session.current_step as Record<string, unknown>)
      : null;

  const possibleRaw: unknown[] = [
    session.current_step_id,
    session.step_id,
    session.active_step_id,
    currentStepObj?.step_id,
    currentStepObj?.id,
    root.current_step_id,
    runRoot.current_step_id,
  ];

  const possibleIds = [...new Set(possibleRaw.map(toStepId).filter((x): x is string => Boolean(x)))];

  for (const id of possibleIds) {
    const byIdAndPhase = steps.find(s => {
      const r = s as unknown as Record<string, unknown>;
      return (r.step_id === id || r.id === id) && (r.phase === canonicalPhase || r.mission_phase === canonicalPhase);
    });
    const found =
      byIdAndPhase ??
      steps.find(s => {
        const r = s as unknown as Record<string, unknown>;
        return r.step_id === id || r.id === id;
      });
    const materialized = materializeScenarioStep(found, canonicalPhase);
    if (materialized) return materialized;
  }

  const n = steps.length;
  const phaseIdx = OPERATIONAL_PHASES.indexOf(canonicalPhase);
  if (phaseIdx >= 0) {
    const derivedIndex =
      n >= OPERATIONAL_PHASES.length
        ? Math.min(phaseIdx, n - 1)
        : Math.min(Math.floor((phaseIdx * n) / OPERATIONAL_PHASES.length), n - 1);
    const byDerivedPhase = materializeScenarioStep(steps[derivedIndex], canonicalPhase);
    if (byDerivedPhase) return byDerivedPhase;
  }

  const byExplicitPhase = steps.find(s => {
    const r = s as unknown as Record<string, unknown>;
    return r.phase === canonicalPhase || r.mission_phase === canonicalPhase;
  });
  return materializeScenarioStep(byExplicitPhase ?? steps[0], canonicalPhase);
};

/** POST /actions/ sometimes returns timers/score only on the envelope — fold into merged state. */
function overlayActionEnvelope(
  merged: MissionState,
  envelope: { time_remaining?: number; score_so_far?: number },
): MissionState {
  const tr = envelope.time_remaining;
  const score = envelope.score_so_far;
  return {
    ...merged,
    ...(typeof tr === 'number' ? { time_remaining: tr } : {}),
    ...(typeof score === 'number' ? { score_so_far: score } : {}),
    run: {
      ...merged.run,
      ...(typeof tr === 'number' ? { time_remaining: tr } : {}),
      ...(typeof score === 'number' ? { score } : {}),
    },
  };
}

function pickLongerString(a: string | undefined, b: string | undefined): string {
  const sa = (a ?? '').trim();
  const sb = (b ?? '').trim();
  return sa.length >= sb.length ? sa : sb;
}

/** Merge session payloads: `server` wins on conflicts (REST / submit body), except briefing text prefers longer copy. */
function mergeSessionStateServerWins(
  socketSession: Record<string, unknown>,
  serverSession: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...socketSession, ...serverSession };
  for (const k of ['briefing_narrative', 'briefing', 'briefing_text'] as const) {
    const s = socketSession[k];
    const r = serverSession[k];
    if (typeof s !== 'string' && typeof r !== 'string') continue;
    const ss = typeof s === 'string' ? s : '';
    const sr = typeof r === 'string' ? r : '';
    if (ss.length === 0 && sr.length === 0) continue;
    out[k] = sr.length >= ss.length ? sr : ss;
  }
  return out;
}

/**
 * Merge WebSocket snapshot with server-fetched state (`bootstrappedState`).
 * Second argument (`server`) is authoritative for session fields and most scalars so stale WS
 * cannot pin `current_step_id` after `getMissionState` / `submitAction` responses.
 */
function mergeMissionState(socket: MissionState | null, server: MissionState | null): MissionState | null {
  if (!socket && !server) return null;
  if (!socket) return server;
  if (!server) return socket;

  const socketSteps = socket.run?.scenario?.steps ?? [];
  const serverSteps = server.run?.scenario?.steps ?? [];
  const steps = serverSteps.length > 0 ? serverSteps : socketSteps;

  const socketS = socket.run.session_state ?? {};
  const serverS = server.run.session_state ?? {};

  return {
    ...socket,
    ...server,
    phase: pickMoreAdvancedPhase(socket.phase, server.phase),
    status: server.status ?? socket.status,
    time_remaining:
      server.time_remaining ??
      socket.time_remaining ??
      server.run?.time_remaining ??
      socket.run?.time_remaining ??
      null,
    score_so_far: server.score_so_far ?? socket.score_so_far,
    participants:
      (server.participants?.length ?? 0) >= (socket.participants?.length ?? 0)
        ? server.participants
        : socket.participants,
    last_5_events:
      (server.last_5_events?.length ?? 0) >= (socket.last_5_events?.length ?? 0)
        ? server.last_5_events
        : socket.last_5_events,
    active_threats:
      (server.active_threats?.length ?? 0) >= (socket.active_threats?.length ?? 0)
        ? server.active_threats
        : socket.active_threats,
    run: {
      ...socket.run,
      ...server.run,
      phase: pickMoreAdvancedPhase(socket.run?.phase, server.run?.phase),
      scenario: {
        ...socket.run.scenario,
        ...server.run.scenario,
        steps,
        description: pickLongerString(socket.run.scenario?.description, server.run.scenario?.description),
      },
      session_state: mergeSessionStateServerWins(
        socketS as Record<string, unknown>,
        serverS as Record<string, unknown>,
      ),
    },
  };
}

function normalizePanelOptions(step: ScenarioStep | null): { id: string; text: string }[] {
  if (!step?.options?.length) return [];
  return step.options.map((o, i) => {
    const r = o as unknown as Record<string, unknown>;
    const id = String(r.id ?? r.option_id ?? r.value ?? r.key ?? `opt-${i}`);
    const text = String(r.text ?? r.label ?? r.title ?? r.name ?? `Option ${i + 1}`);
    return { id, text };
  });
}

function channelStatusLabel(status: MissionConnectionStatus): string {
  switch (status) {
    case 'connected':
      return 'Channel live';
    case 'syncing':
      return 'Syncing state…';
    case 'reconnecting':
      return 'Reconnecting…';
    case 'connecting':
      return 'Connecting…';
    case 'failed':
      return 'Connection lost';
    default:
      return 'Offline';
  }
}

function channelStatusTone(status: MissionConnectionStatus): 'live' | 'warn' | 'off' {
  if (status === 'connected') return 'live';
  if (status === 'disconnected' || status === 'failed') return 'off';
  return 'warn';
}

function formatApiError(err: unknown, fallback: string): string {
  const ax = err as AxiosError<Record<string, string | string[] | undefined> | { error?: string; detail?: string }>;
  const data = ax.response?.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    if ('error' in data && typeof data.error === 'string') return data.error;
    if ('detail' in data && typeof data.detail === 'string') return data.detail;
    const parts = Object.entries(data)
      .map(([k, v]) => {
        if (v == null) return '';
        const s = Array.isArray(v) ? v.join(', ') : String(v);
        return s ? `${k}: ${s}` : '';
      })
      .filter(Boolean);
    if (parts.length) return parts.join(' · ');
  }
  return fallback;
}

const shareInviteButtonClass =
  'inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-500/20 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-100 dark:hover:bg-amber-500/20';

const MissionPlayerPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { runId } = useParams<{ runId: string }>();
  const { token, user } = useAuth();

  const returnToPath = useMemo(() => {
    const st = (location.state as { returnTo?: string } | null)?.returnTo;
    if (typeof st === 'string' && st.startsWith('/')) return st;
    const q = searchParams.get('returnTo');
    if (q) {
      try {
        const decoded = decodeURIComponent(q);
        if (decoded.startsWith('/')) return decoded;
      } catch {
        /* ignore */
      }
    }
    return null;
  }, [location.state, searchParams]);

  const [showBriefing, setShowBriefing] = useState(true);
  const [showReview, setShowReview] = useState(false);
  const [escalationAlert, setEscalationAlert] = useState<string | null>(null);
  const [glitchActive, setGlitchActive] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hintText, setHintText] = useState<string | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [finalScore, setFinalScore] = useState<FinalScore | null>(null);
  const [allReady, setAllReady] = useState(false);
  const [isAcknowledgingBriefing, setIsAcknowledgingBriefing] = useState(false);
  const [briefingDismissed, setBriefingDismissed] = useState(false);
  const [isEscalated, setIsEscalated] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [preflightStatus, setPreflightStatus] = useState<PreflightStatus>('checking');
  const [bootstrappedState, setBootstrappedState] = useState<MissionState | null>(null);

  const eventListRef = useRef<IncidentEvent[]>([]);
  const completionScoreFetchedRef = useRef(false);
  const [events, setEvents] = useState<IncidentEvent[]>([]);

  const safeRunId = runId ?? '';
  const safeToken = token ?? '';

  const onPhaseChange = useCallback((phase: MissionPhase) => {
    if (phase !== 'briefing') setShowBriefing(false);
    setShowReview(phase === 'review');
  }, []);

  const onEscalation = useCallback((event: IncidentEvent) => {
    setIsEscalated(true);
    const msg = event.payload?.message;
    setEscalationAlert(typeof msg === 'string' ? msg : 'Escalation triggered');
    setGlitchActive(true);
    window.setTimeout(() => setGlitchActive(false), 3000);
  }, []);

  const onTimeout = useCallback(() => {
    setEscalationAlert('Timeout occurred');
    setToast({ type: 'info', message: 'Phase timer elapsed.' });
  }, []);

  const fetchScoreAndReview = useCallback(async () => {
    if (!safeRunId) return;
    try {
      const s = await getFinalScore(safeRunId);
      setFinalScore(s);
    } catch {
      setToast({ type: 'error', message: 'Could not load final score yet. You can retry from the review screen.' });
    }
    setShowReview(true);
  }, [safeRunId]);

  const onMissionCompleteWs = useCallback(
    (_score: number, _passed: boolean) => {
      void fetchScoreAndReview();
    },
    [fetchScoreAndReview],
  );

  const socketEnabled = preflightStatus === 'ready' && Boolean(safeRunId && safeToken);

  const resyncMissionState = useCallback(async () => {
    if (!safeRunId) return null;
    const fresh = await getMissionState(safeRunId);
    setBootstrappedState(fresh);
    return fresh;
  }, [safeRunId]);

  const resolveSocketToken = useCallback(async () => {
    try {
      const { access } = await refreshToken();
      return access;
    } catch {
      return localStorage.getItem('access_token');
    }
  }, []);

  const handleSocketDisconnect = useCallback(() => {
    setIsSubmitting(false);
  }, []);

  const applyHintResult = useCallback(
    (data: { hint: string; hints_used: number }) => {
      setHintText(data.hint);
      setHintsUsed(data.hints_used);
      void getMissionState(safeRunId)
        .then(fresh => {
          setBootstrappedState(prev => (prev ? mergeMissionState(prev, fresh) ?? fresh : fresh));
        })
        .catch(() => {
          /* WebSocket may still push state */
        });
    },
    [safeRunId],
  );

  const {
    missionState: wsMissionState,
    isConnected: channelLive,
    connectionStatus,
    reconnectAttempt,
    lastEvent,
    timerWarning,
    retryConnection,
    sendMessage,
  } = useMissionSocket({
    runId: socketEnabled ? safeRunId : '',
    token: socketEnabled ? safeToken : '',
    enabled: socketEnabled,
    onPhaseChange,
    onEscalation,
    onTimeout,
    onMissionComplete: onMissionCompleteWs,
    onResync: resyncMissionState,
    resolveToken: resolveSocketToken,
    onDisconnect: handleSocketDisconnect,
    onHint: applyHintResult,
  });

  const channelTone = channelStatusTone(connectionStatus);
  const showReconnectBanner =
    !showBriefing &&
    !showReview &&
    connectionStatus !== 'connected' &&
    connectionStatus !== 'disconnected' &&
    connectionStatus !== 'failed';
  const showConnectionFailed =
    !showBriefing && !showReview && connectionStatus === 'failed';
  const actionsFrozen = !channelLive;

  /** Merged view: WebSocket + REST (`bootstrappedState`). REST wins on `session_state` so step/phase stay in sync after actions. */
  const missionState = useMemo(
    () => mergeMissionState(wsMissionState, bootstrappedState),
    [wsMissionState, bootstrappedState],
  );

  /** Prefer longest non-empty source so partial WS payloads never replace the full briefing. */
  const briefingNarrative = useMemo(() => {
    const ss = missionState?.run?.session_state ?? {};
    const sc = missionState?.run?.scenario;
    const candidates = [
      ss.briefing_narrative,
      ss.briefing,
      ss.briefing_text,
      ss.narrative,
      sc?.description,
    ].filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
    if (candidates.length === 0) return '';
    return candidates.reduce((a, b) => (b.trim().length > a.trim().length ? b : a)).trim();
  }, [missionState]);

  const resolvedStep = useMemo(() => extractCurrentStep(missionState), [missionState]);
  const activeStepIndex = useMemo(() => readActiveStepIndex(missionState), [missionState]);
  const panelOptions = useMemo(() => normalizePanelOptions(resolvedStep), [resolvedStep]);

  useEffect(() => {
    if (!safeRunId || !safeToken || !user) {
      setPreflightStatus('idle');
      return;
    }

    let cancelled = false;

    const runPreflight = async () => {
      setPreflightStatus('checking');
      setBootError(null);

      try {
        let state = await getMissionState(safeRunId);
        if (cancelled) return;
        setBootstrappedState(state);

        let participants: MissionParticipant[] = state.participants ?? [];
        try {
          const list = await getParticipants(safeRunId);
          if (list.length > 0) participants = list;
        } catch {
          /* use mission state participants */
        }

        if (!userIsParticipant(participants, user)) {
          setPreflightStatus('joining');
          try {
            await joinMissionRun(safeRunId, {});
          } catch (e) {
            const msg = formatApiError(e, '');
            if (!/already|joined|participant|exists|duplicate|member/i.test(msg)) {
              throw e;
            }
          }
          if (cancelled) return;
          state = await getMissionState(safeRunId);
          if (!cancelled) setBootstrappedState(state);
        }

        if (!cancelled) setPreflightStatus('ready');
      } catch (e) {
        if (!cancelled) {
          setBootstrappedState(null);
          setBootError(formatApiError(e, 'Could not load mission state.'));
          setPreflightStatus('error');
        }
      }
    };

    void runPreflight();
    return () => {
      cancelled = true;
    };
  }, [safeRunId, safeToken, user]);

  useEffect(() => {
    if (!showReview || !safeRunId || finalScore) return;
    let cancelled = false;
    void getFinalScore(safeRunId)
      .then(s => {
        if (!cancelled) setFinalScore(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [showReview, safeRunId, finalScore]);

  useEffect(() => {
    completionScoreFetchedRef.current = false;
    setBriefingDismissed(false);
    setIsAcknowledgingBriefing(false);
  }, [safeRunId]);

  useEffect(() => {
    const phase = missionState?.phase;
    if (phase) {
      if (!briefingDismissed) {
        setShowBriefing(phase === 'briefing');
      }
      setShowReview(phase === 'review');
      if (phase !== 'briefing') {
        setAllReady(true);
        setBriefingDismissed(true);
        setShowBriefing(false);
      }
    }
  }, [missionState, briefingDismissed]);

  /** Backend sometimes sets `status: completed` before or without `phase: review` — sync UI and score. */
  useEffect(() => {
    const phase = missionState?.phase;
    const status = missionState?.status;
    if (status !== 'completed' && phase !== 'review') {
      if (phase === 'briefing' || !phase) completionScoreFetchedRef.current = false;
      return;
    }
    if (!safeRunId || completionScoreFetchedRef.current) return;
    completionScoreFetchedRef.current = true;
    setShowBriefing(false);
    setShowReview(true);
    void getFinalScore(safeRunId)
      .then(s => setFinalScore(s))
      .catch(() => {
        completionScoreFetchedRef.current = false;
      });
  }, [missionState?.phase, missionState?.status, safeRunId]);

  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.event_type === 'hint_requested') {
      const text = lastEvent.payload?.hint_text;
      if (typeof text === 'string' && text.trim()) {
        setHintText(text);
      }
    }
    const existing = eventListRef.current;
    const next = [lastEvent, ...existing].slice(0, 50);
    eventListRef.current = next;
    setEvents(next);
  }, [lastEvent]);

  useEffect(() => {
    const session = missionState?.run?.session_state as Record<string, unknown> | undefined;
    const used = session?.hints_used;
    if (typeof used === 'number' && Number.isFinite(used)) {
      setHintsUsed(Math.max(0, Math.floor(used)));
    }
  }, [missionState?.run?.session_state]);

  useEffect(() => {
    const base = missionState?.last_5_events ?? [];
    if (base.length === 0) return;
    const merged = [...base]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 8);
    eventListRef.current = merged;
    setEvents(merged);
  }, [missionState?.last_5_events]);

  const mode = useMemo(() => getOperatorMode(user?.role, user?.job_title), [user?.role, user?.job_title]);

  const currentPhase = missionState?.phase ?? 'briefing';
  const timeRemaining = missionState?.time_remaining ?? missionState?.run?.time_remaining ?? null;
  const score = missionState?.score_so_far ?? missionState?.run?.score ?? 0;

  useEffect(() => {
    setHintText(null);
  }, [currentPhase, resolvedStep?.step_id]);

  const phaseTimeLimit = useMemo(() => {
    const fromStep = resolvedStep?.time_limit_seconds;
    if (typeof fromStep === 'number' && fromStep > 0) return fromStep;
    const ss = missionState?.run?.session_state ?? {};
    const maybe = ss.phase_time_limit;
    if (typeof maybe === 'number' && maybe > 0) return maybe;
    return 60;
  }, [resolvedStep?.time_limit_seconds, missionState?.run?.session_state]);

  const scenarioTitle = missionState?.run?.scenario?.title ?? 'Mission Scenario';
  const threatType = missionState?.run?.scenario?.threat_type ?? 'unknown';
  const operatorRoleLabel = user?.role ?? 'operator';

  const participants = missionState?.participants ?? [];
  const participantCount = Math.max(participants.length, missionState?.run?.participant_count ?? 0);
  const teamActive = participantCount >= 2;
  const showSoloModeBanner = !showBriefing && !showReview && participantCount <= 1;
  const standbyMode = !showBriefing && !showReview && events.length === 0;
  const isLaunchingMission =
    briefingDismissed &&
    !showBriefing &&
    !showReview &&
    (isAcknowledgingBriefing || currentPhase === 'briefing');

  const handleCopyMissionLink = useCallback(async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    try {
      await navigator.clipboard.writeText(url);
      setToast({ type: 'success', message: 'Mission link copied. Send it to your crew.' });
    } catch {
      setToast({ type: 'info', message: url || 'Could not copy automatically.' });
    }
  }, []);


  const inviteButton = (
    <button type="button" className={shareInviteButtonClass} onClick={() => void handleCopyMissionLink()}>
      <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
      Copy invite link
    </button>
  );

  const handleAcknowledge = useCallback(async () => {
    if (!safeRunId || isAcknowledgingBriefing) return;
    setIsAcknowledgingBriefing(true);
    try {
      const r = await acknowledgeBriefing(safeRunId);
      setAllReady(Boolean(r.all_ready));

      let fresh: MissionState | null = r.current_state ?? null;
      if (!fresh) {
        try {
          fresh = await getMissionState(safeRunId);
        } catch {
          /* keep merged WS state */
        }
      }
      if (fresh) {
        setBootstrappedState(prev =>
          prev ? mergeMissionState(prev, fresh) ?? fresh : fresh,
        );
      }

      const pc = Math.max(
        fresh?.participants?.length ?? 0,
        fresh?.run?.participant_count ?? 0,
      );
      const soloish = pc <= 1;
      if (r.all_ready || soloish) {
        setBriefingDismissed(true);
        setShowBriefing(false);
      }
      if (soloish && !r.all_ready) {
        setToast({
          type: 'info',
          message: 'Solo mode: briefing cleared for you. Other operators can still join via the mission link.',
        });
      }
    } catch (err) {
      setToast({ type: 'error', message: formatApiError(err, 'Could not acknowledge briefing.') });
    } finally {
      setIsAcknowledgingBriefing(false);
    }
  }, [safeRunId, isAcknowledgingBriefing]);

  const handleSubmitOption = useCallback(
    async (optionId: string) => {
      if (!safeRunId || !resolvedStep || actionsFrozen) return;
      try {
        setIsSubmitting(true);
        setHintText(null);
        const res = await submitAction(safeRunId, {
          action_type: 'decision',
          step_id: resolvedStep.step_id,
          decision_data: { option_id: optionId },
          timestamp_client: Date.now(),
        });
        if (res?.current_state) {
          setBootstrappedState(
            overlayActionEnvelope(res.current_state, {
              time_remaining: res.time_remaining,
              score_so_far: res.score_so_far,
            }),
          );
        }
        try {
          const fresh = await getMissionState(safeRunId);
          setBootstrappedState(mergeMissionState(wsMissionState, fresh) ?? fresh);
        } catch {
          if (!res?.current_state) {
            /* no REST refresh available */
          }
        }
        if (res?.event) {
          eventListRef.current = [res.event, ...eventListRef.current].slice(0, 50);
          setEvents([...eventListRef.current]);
        }
      } catch (err) {
        setToast({ type: 'error', message: formatApiError(err, 'Action could not be submitted.') });
      } finally {
        setIsSubmitting(false);
      }
    },
    [resolvedStep, safeRunId, wsMissionState, actionsFrozen],
  );

  const handleRequestHint = useCallback(async () => {
    if (!safeRunId || actionsFrozen) return;
    try {
      if (channelLive) {
        sendMessage('request_hint', {});
        return;
      }
      const r = await requestHint(safeRunId);
      applyHintResult(r);
    } catch (err) {
      setToast({ type: 'error', message: formatApiError(err, 'Hint not available.') });
    }
  }, [safeRunId, actionsFrozen, channelLive, sendMessage, applyHintResult]);

  const handleAbandon = useCallback(async () => {
    if (!safeRunId) return;
    if (!window.confirm('Leave this mission? Progress may be lost.')) return;
    try {
      await abandonMission(safeRunId);
      navigate(returnToPath ?? '/dashboard/simulations');
    } catch (err) {
      setToast({ type: 'error', message: formatApiError(err, 'Could not abandon mission.') });
    }
  }, [safeRunId, navigate, returnToPath]);

  const handleExitHeader = useCallback(() => {
    navigate(returnToPath ?? '/dashboard/simulations');
  }, [navigate, returnToPath]);

  const glitchOverlay = glitchActive ? (
    <div className="pointer-events-none absolute inset-0 z-10 rounded-xl">
      <div className="absolute inset-0 animate-pulse rounded-xl bg-red-500/15" />
    </div>
  ) : null;

  const escalBanner = escalationAlert ? (
    <div className="pointer-events-none fixed left-1/2 top-20 z-[55] -translate-x-1/2 px-4">
      <div className="rounded-lg border border-red-400/50 bg-red-950/90 px-4 py-2 text-sm font-medium text-red-100 shadow-lg shadow-red-900/40 animate-pulse dark:bg-red-950/95">
        {escalationAlert}
      </div>
    </div>
  ) : null;

  if (!safeRunId) {
    return (
      <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-zinc-100 text-zinc-700 dark:bg-slate-950 dark:text-slate-200">
        <p className="text-sm font-medium">Missing mission run in the URL.</p>
        <button
          type="button"
          className="mt-4 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
          onClick={() => navigate('/dashboard/simulations')}
        >
          Back to simulations
        </button>
      </div>
    );
  }

  if (!safeToken || !user) {
    return (
      <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-zinc-100 px-6 text-center dark:bg-slate-950">
        <ShieldAlert className="mb-3 text-amber-600 dark:text-amber-400" size={40} />
        <p className="text-sm font-medium text-zinc-800 dark:text-slate-100">Sign in required to join the live mission channel.</p>
        <button
          type="button"
          className="mt-4 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
          onClick={() => navigate('/login')}
        >
          Go to login
        </button>
      </div>
    );
  }

  if (preflightStatus === 'checking' || preflightStatus === 'joining') {
    return (
      <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-slate-100 to-slate-200 text-slate-700 dark:from-slate-950 dark:to-slate-900 dark:text-slate-200">
        <div className="relative">
          <Spinner size="xl" />
          {preflightStatus === 'joining' && (
            <span className="absolute -inset-3 rounded-full border border-emerald-500/30 animate-ping" aria-hidden />
          )}
        </div>
        <div className="max-w-sm px-6 text-center">
          <p className="text-sm font-semibold tracking-wide text-slate-800 dark:text-slate-100">
            {preflightStatus === 'joining' ? 'Joining mission…' : 'Loading mission…'}
          </p>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
            {preflightStatus === 'joining'
              ? 'Registering you on this run so teammates see you in the roster.'
              : 'Fetching scenario state and operator roster.'}
          </p>
        </div>
      </div>
    );
  }

  if (preflightStatus === 'error' && !missionState) {
    return (
      <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4 bg-zinc-100 px-6 text-center dark:bg-slate-950">
        <p className="max-w-md text-sm text-red-700 dark:text-red-400">{bootError}</p>
        <button
          type="button"
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          onClick={() => navigate(returnToPath ?? '/dashboard/simulations')}
        >
          Go back
        </button>
      </div>
    );
  }

  const phaseIndex = Math.max(0, phaseOrder.indexOf(currentPhase)) + 1;

  return (
    <div className="mission-player fixed inset-0 z-40">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {escalBanner}

      <header className="mission-player__header">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
            <Radio size={18} aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[10px] font-semibold uppercase tracking-widest text-zinc-500 dark:text-slate-400 sm:text-xs">
              Immersive mission
            </p>
            <p className="truncate text-sm font-semibold text-zinc-900 dark:text-slate-50">{scenarioTitle}</p>
          </div>
        </div>
        <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto">
          <button
            type="button"
            onClick={() => void handleCopyMissionLink()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-800 transition hover:bg-zinc-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 sm:px-3 sm:text-xs"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Copy link</span>
            <span className="sm:hidden">Link</span>
          </button>
          <span
            className={[
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
              teamActive
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                : 'border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-300',
              channelLive ? '' : 'opacity-80',
            ].join(' ')}
          >
            <Users className="h-3 w-3 shrink-0" aria-hidden />
            {participantCount}
          </span>
          <span
            className={[
              'hidden rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide sm:inline',
              channelTone === 'live'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                : channelTone === 'warn'
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200'
                  : 'border-slate-400/40 bg-slate-100 text-slate-600 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-300',
            ].join(' ')}
          >
            {channelStatusLabel(connectionStatus)}
          </span>
          <button
            type="button"
            className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 sm:px-3 sm:text-xs"
            onClick={handleExitHeader}
          >
            Exit
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-800 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200 dark:hover:bg-red-950/80 sm:px-3 sm:text-xs"
            onClick={() => void handleAbandon()}
          >
            <LogOut size={14} aria-hidden />
            Abandon
          </button>
        </div>
      </header>

      {showBriefing ? (
        <BriefingScreen
          narrative={briefingNarrative}
          scenarioTitle={scenarioTitle}
          threatType={threatType}
          operatorRole={operatorRoleLabel}
          onAcknowledge={handleAcknowledge}
          isReady={allReady}
          soloMode={participantCount <= 1}
          isAcknowledging={isAcknowledgingBriefing}
          inviteSlot={inviteButton}
        />
      ) : null}

      {isLaunchingMission ? (
        <div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-slate-950/90 px-6 text-center backdrop-blur-md"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <Spinner size="xl" />
          <div>
            <p className="text-base font-semibold text-white">Entering simulation</p>
            <p className="mt-2 max-w-sm text-sm text-slate-300">
              Syncing mission state and loading the operations console…
            </p>
          </div>
        </div>
      ) : null}

      {showReview ? (
        <ReviewScreen
          variant="studio"
          score={finalScore}
          scenarioTitle={scenarioTitle}
          onRetry={() => navigate('/dashboard/simulations')}
          onBackToDashboard={() => navigate('/dashboard')}
          onReturnToTraining={returnToPath ? () => navigate(returnToPath) : undefined}
        />
      ) : null}

      {!showBriefing && !showReview && (
        <div className="mission-player__body">
          <div className="mission-player__alerts">
          {showConnectionFailed ? (
            <div className="shrink-0 border-b border-red-500/35 bg-red-500/10 px-3 py-3 dark:bg-red-500/15 sm:px-4">
              <div className="mx-auto flex max-w-4xl flex-col items-center justify-center gap-2 text-center sm:flex-row sm:gap-4">
                <p className="text-xs font-medium text-red-950 dark:text-red-100 sm:text-sm">
                  Mission connection lost after {reconnectAttempt} attempts. Decisions are paused until you reconnect.
                </p>
                <button
                  type="button"
                  onClick={() => retryConnection()}
                  className="inline-flex shrink-0 items-center justify-center rounded-lg border border-red-600/40 bg-white px-4 py-2 text-xs font-semibold text-red-900 shadow-sm hover:bg-red-50 dark:bg-red-950/40 dark:text-red-100 dark:hover:bg-red-950/60"
                >
                  Retry connection
                </button>
              </div>
            </div>
          ) : null}

          {showReconnectBanner ? (
            <div
              className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 dark:bg-amber-500/15 sm:px-4"
              role="status"
              aria-live="polite"
            >
              <div className="mx-auto flex max-w-4xl items-center justify-center gap-2 text-center text-xs text-amber-950 dark:text-amber-100 sm:text-sm">
                <Spinner size="sm" />
                <span>
                  {connectionStatus === 'syncing'
                    ? 'Connection restored — reloading mission state…'
                    : `Live channel interrupted — reconnecting${reconnectAttempt > 0 ? ` (attempt ${reconnectAttempt})` : ''}…`}
                </span>
              </div>
            </div>
          ) : null}

          </div>

          <PhaseBar variant="cockpit" currentPhase={currentPhase} timeRemaining={timeRemaining} score={score} />

          <p className="shrink-0 border-b border-[var(--border-color)] bg-[var(--bg-tertiary)] px-3 py-1.5 text-center text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)] sm:px-4">
            Phase {phaseIndex} of {phaseOrder.length}
            <span className="mx-2 text-[var(--border-color)]">·</span>
            <span className="text-[var(--text-secondary)]">{currentPhase.replace(/_/g, ' ')}</span>
            {resolvedStep?.step_id ? (
              <>
                <span className="mx-2 text-[var(--border-color)]">·</span>
                <span className="font-mono text-[var(--text-muted)]">{resolvedStep.step_id}</span>
              </>
            ) : null}
          </p>

          <div className="mission-player__workspace">
            <div className="mission-player__main">
              <div
                className={['mission-player__tactical', teamActive ? 'mission-player__tactical--team' : ''].join(' ')}
              >
                <div className="mission-player__tactical-viewport">
                  {mode === 'atc' ? (
                    <RadarScope
                      threatType={threatType}
                      currentPhase={currentPhase}
                      sessionState={missionState?.run?.session_state ?? {}}
                      glitchActive={glitchActive}
                      isEscalated={isEscalated}
                      teamActive={teamActive}
                      standbyMode={standbyMode}
                    />
                  ) : (
                    <OpsDashboard
                      threatType={threatType}
                      currentPhase={currentPhase}
                      glitchActive={glitchActive}
                      isEscalated={isEscalated}
                      appearance="immersive"
                      standbyMode={standbyMode}
                      teamActive={teamActive}
                    />
                  )}
                  {glitchOverlay}
                </div>

                <div className="mission-player__decision-slot">
                  <DecisionPanel
                    key={`${currentPhase}-${activeStepIndex ?? 0}-${resolvedStep?.step_id ?? 'no-step'}`}
                    variant="immersive"
                    description={channelLive ? resolvedStep?.description : undefined}
                    options={channelLive ? panelOptions : []}
                    onSubmitAction={handleSubmitOption}
                    onRequestHint={handleRequestHint}
                    isSubmitting={isSubmitting}
                    hintText={hintText}
                    hintsUsed={hintsUsed}
                    channelConnected={channelLive}
                    awaitingNextStep={isSubmitting}
                  />
                </div>
              </div>
            </div>

            <aside className="mission-player__sidebar">
              {showSoloModeBanner ? (
                <div className="mission-player__sidebar-card">
                  <div className="mission-player__solo-banner">
                    <strong>Solo mode</strong>
                    <p>Complete this mission alone, or share the invite link for optional teammates.</p>
                    <button
                      type="button"
                      onClick={() => void handleCopyMissionLink()}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--info)_40%,transparent)] bg-[var(--bg-secondary)] px-3 py-1.5 text-xs font-semibold text-[var(--info)] hover:bg-[var(--bg-hover)]"
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden />
                      Copy invite link
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="mission-player__sidebar-card">
                <ParticipantBadges
                  variant="cockpit"
                  participants={participants}
                  currentUserEmail={user?.email}
                  currentUserUsername={user?.username}
                  socketConnected={channelLive}
                />
              </div>

              <div className="mission-player__sidebar-scroll">
                <div className="mission-player__sidebar-card min-h-[200px] flex-1 lg:min-h-[240px]">
                  <EventFeed events={events} variant="immersive" />
                </div>

                <div className="mission-player__sidebar-card mission-player__telemetry">
                  <div className="mission-player__telemetry-row">
                    <span className="mission-player__telemetry-label">Status</span>
                    <span
                      className={[
                        'mission-player__telemetry-value',
                        channelTone === 'live' ? 'mission-player__telemetry-value--live' : '',
                        channelTone === 'warn' ? 'mission-player__telemetry-value--warn' : '',
                      ].join(' ')}
                    >
                      {channelStatusLabel(connectionStatus)}
                    </span>
                  </div>
                  <div className="mission-player__telemetry-row">
                    <span className="mission-player__telemetry-label">Phase</span>
                    <span className="mission-player__telemetry-value">
                      {phaseIndex}/{phaseOrder.length}
                    </span>
                  </div>
                  <div className="mission-player__telemetry-row">
                    <span className="mission-player__telemetry-label">Timer stress</span>
                    <span
                      className={[
                        'mission-player__telemetry-value',
                        timerWarning ? 'mission-player__telemetry-value--warn' : '',
                      ].join(' ')}
                    >
                      {timerWarning ? 'Elevated' : 'Normal'}
                    </span>
                  </div>
                  {teamActive ? (
                    <div className="mission-player__telemetry-row">
                      <span className="mission-player__telemetry-label">Operators</span>
                      <span className="mission-player__telemetry-value mission-player__telemetry-value--live">
                        Multi-operator active
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            </aside>
          </div>
        </div>
      )}

      <StressHUD
        surface="cockpit"
        timeRemaining={timeRemaining}
        phaseTimeLimit={phaseTimeLimit}
        isEscalated={isEscalated}
      />
    </div>
  );
};

export default MissionPlayerPage;
