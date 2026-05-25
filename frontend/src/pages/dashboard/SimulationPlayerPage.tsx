import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AxiosError } from 'axios';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  getSession,
  getScenario,
  submitDecision,
  requestHint,
  abandonSimulation,
} from '../../services/simulationService';
import type {
  SimulationSessionDetail,
  SimulationStep,
  StepOption,
  ScenarioWithSteps,
} from '../../types/simulation';
import { showToast } from '../../lib/toast';
import '../../assets/css/SimulationPlayer.css';

const KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];

/**
 * When `GET /simulations/sessions/{id}/` omits `current_step_data` (common with minimal serializers),
 * derive the active step from `GET /simulations/scenarios/{id}/` + `session.current_step`.
 */
function deriveStepFromScenario(
  session: SimulationSessionDetail,
  scenario: ScenarioWithSteps,
): SimulationStep | null {
  const steps = scenario.steps;
  if (!steps?.length) return null;

  const cs = session.current_step;
  const idx = cs <= 0 ? 0 : Math.min(cs - 1, steps.length - 1);
  const raw = steps[idx];
  const rawOptions = raw?.options;
  if (!raw || !rawOptions?.length) return null;

  const options: StepOption[] = rawOptions.map((o, i) => ({
    id: o.id ?? i,
    text: (o.text ?? o.label ?? `Option ${i + 1}`).toString(),
    label: o.label,
  }));

  return {
    number: typeof raw.number === 'number' && raw.number > 0 ? raw.number : idx + 1,
    title: raw.title ?? scenario.title ?? 'Decision',
    description: (raw.description ?? raw.question ?? raw.prompt ?? '').toString(),
    options,
    time_limit: raw.time_limit,
  };
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const SimulationPlayerPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const returnToPath = useMemo(() => {
    const st = (location.state as { returnTo?: string } | null)?.returnTo;
    if (typeof st === 'string' && st.startsWith('/')) return st;
    return null;
  }, [location.state]);

  const exitAfterSim = returnToPath ?? '/dashboard/simulations';

  const [session, setSession] = useState<SimulationSessionDetail | null>(null);
  const [currentStep, setCurrentStep] = useState<SimulationStep | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | number | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ correct: boolean; message: string } | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [hintsRemaining, setHintsRemaining] = useState(3);
  const [loadingHint, setLoadingHint] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [resultData, setResultData] = useState<{
    passed: boolean;
    score: number;
    summary?: {
      total_steps: number;
      correct_decisions: number;
      incorrect_decisions: number;
      accuracy: number;
      time_spent: number;
      hints_used: number;
    };
  } | null>(null);
const stepStartRef = useRef(Date.now());
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selectedOptionRef = useRef<string | number | null>(null);
  const handleSubmitRef = useRef<() => void>(() => {});

  // Keep selectedOptionRef current so the timer expiry callback can read it
  useEffect(() => { selectedOptionRef.current = selectedOption; }, [selectedOption]);

  const loadSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      const data = await getSession(sessionId);
      setHintsRemaining(Math.max(0, 3 - (data.hints_used ?? 0)));

      if (data.status === 'completed' || data.status === 'failed') {
        setSession(data);
        setCompleted(true);
        setResultData({ passed: data.passed, score: data.score ?? 0 });
        return;
      }

      if (data.current_step_data) {
        setSession(data);
        setCurrentStep(data.current_step_data);
        stepStartRef.current = Date.now();
        return;
      }

      if (data.scenario?.id) {
        try {
          const detail = await getScenario(data.scenario.id);
          const merged: SimulationSessionDetail = {
            ...data,
            total_steps: data.total_steps ?? detail.steps?.length,
          };
          setSession(merged);
          const derived = deriveStepFromScenario(merged, detail);
          if (derived) {
            setCurrentStep(derived);
            stepStartRef.current = Date.now();
            return;
          }
        } catch {
          // scenario detail optional; fall through to bare session
        }
      }

      setSession(data);
    } catch {
      showToast({ type: 'error', message: 'Failed to load simulation session.' });
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // Start / restart timer whenever the active step changes
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!currentStep) return;

    setElapsed(0);
    if (currentStep.time_limit && currentStep.time_limit > 0) {
      setTimeLeft(currentStep.time_limit);
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => (prev === null || prev <= 0 ? 0 : prev - 1));
      }, 1000);
    } else {
      setTimeLeft(null);
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    }

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [currentStep]);

  // Stop timer once feedback is visible (answer submitted or time expired)
  useEffect(() => {
    if (feedback && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [feedback]);

  // When countdown hits zero: auto-submit if option chosen, otherwise mark expired
  useEffect(() => {
    if (timeLeft !== 0 || feedback) return;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (selectedOptionRef.current !== null) {
      handleSubmitRef.current();
    } else {
      setFeedback({ correct: false, message: "⏱ Time's up! No response was selected." });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  const handleSubmit = async () => {
    if (!selectedOption || !currentStep || !session) return;
    if (submitting || feedback) return;
    if (session.status === 'completed' || session.status === 'failed' || session.status === 'abandoned') return;

    const timeTaken = Math.max(0, Math.round((Date.now() - stepStartRef.current) / 1000));
    const stepNumber = Math.max(0, Number(session.current_step) || 0);

    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await submitDecision({
        session_id: session.id,
        step_number: stepNumber,
        decision_type: 'choice',
        decision_data: { option_id: selectedOption },
        time_taken: timeTaken,
      });

      const feedbackMsg =
        typeof res.feedback === 'string'
          ? res.feedback
          : (res.feedback?.message as string) ?? (res.correct ? 'Correct response!' : 'Incorrect — review the scenario.');
      setFeedback({ correct: res.correct, message: feedbackMsg });
      setSession(res.session);

      if (res.completed) {
        setCompleted(true);
        setResultData({
          passed: res.passed ?? false,
          score: res.score ?? res.session.score ?? 0,
          summary: res.summary,
        });
      } else if (res.next_step) {
        setTimeout(() => {
          setCurrentStep(res.next_step as SimulationStep);
          setSelectedOption(null);
          setFeedback(null);
          setHint(null);
          stepStartRef.current = Date.now();
        }, 1800);
      }
    } catch (err) {
      const ax = err as AxiosError<
        | { error?: string; detail?: string }
        | Record<string, string | string[] | undefined>
      >;
      const data = ax.response?.data;
      let message = 'Failed to submit your decision. Please try again.';
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        if (typeof data.error === 'string') {
          message = data.error;
        } else if (typeof (data as { detail?: string }).detail === 'string') {
          message = (data as { detail: string }).detail;
        } else {
          const fieldErrors = Object.entries(data)
            .map(([key, val]) => {
              if (val == null) return '';
              const v = Array.isArray(val) ? val.join(', ') : String(val);
              return v ? `${key}: ${v}` : '';
            })
            .filter(Boolean);
          if (fieldErrors.length) message = fieldErrors.join(' · ');
        }
      }
      showToast({ type: 'error', message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleHint = async () => {
    if (!currentStep || !session || hintsRemaining <= 0) return;
    setLoadingHint(true);
    try {
      const data = await requestHint({
        session_id: session.id,
        step_number: Math.max(0, Number(session.current_step) || 0),
      });
      setHint(data.hint);
      setHintsRemaining(data.hints_remaining);
    } catch {
      showToast({ type: 'error', message: 'No hints available for this step.' });
    } finally {
      setLoadingHint(false);
    }
  };

  const handleAbandon = async () => {
    if (!session) return;
    if (!window.confirm('Abandon this simulation? Your progress will not be saved.')) return;
    try {
      await abandonSimulation(session.id);
    } finally {
      navigate(exitAfterSim);
    }
  };

  const totalSteps = session?.total_steps ?? session?.scenario?.estimated_time ?? 10;
  const progress = session ? Math.min(100, Math.round((session.current_step / totalSteps) * 100)) : 0;
  const showFeedback = feedback !== null;
  const optionDisabled = showFeedback || submitting;

  const timerUrgency = useMemo(() => {
    if (timeLeft === null) return 'neutral';
    const limit = currentStep?.time_limit ?? 60;
    const ratio = timeLeft / limit;
    if (ratio <= 0.1 || timeLeft <= 10) return 'critical';
    if (ratio <= 0.3 || timeLeft <= 30) return 'urgent';
    return 'normal';
  }, [timeLeft, currentStep]);

  const timerDisplay = useMemo(() => {
    const secs = timeLeft !== null ? timeLeft : elapsed;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }, [timeLeft, elapsed]);

  // Always keep handleSubmitRef pointing at the latest version
  handleSubmitRef.current = handleSubmit;

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="sim-player">
        <div className="sim-loading">
          <div className="sim-spinner" />
          <span>Loading simulation…</span>
        </div>
      </div>
    );
  }

  // ── Completed ────────────────────────────────────────────────────────────
  if (completed && resultData) {
    const { passed, score, summary } = resultData;
    return (
      <div className="sim-player">
<div className="sim-result">
          <div className="sim-result-card">
            <div className="sim-result-icon">{passed ? '🏆' : '📋'}</div>
            <h1 className={`sim-result-title ${passed ? 'passed' : 'failed'}`}>
              {passed ? 'Mission Complete' : 'Simulation Ended'}
            </h1>
            <p className="sim-result-subtitle">
              {passed
                ? `You successfully completed the ${session?.scenario?.title ?? 'scenario'}.`
                : `Keep training — you'll improve with practice.`}
            </p>

            <div className="sim-result-score">{Math.round(score ?? 0)}</div>
            <div className="sim-result-score-label">Points earned</div>

            {summary && (
              <div className="sim-result-stats">
                <div className="sim-stat">
                  <div className="sim-stat-value">{summary.correct_decisions}</div>
                  <div className="sim-stat-label">Correct</div>
                </div>
                <div className="sim-stat">
                  <div className="sim-stat-value">{Math.round(summary.accuracy ?? 0)}%</div>
                  <div className="sim-stat-label">Accuracy</div>
                </div>
                <div className="sim-stat">
                  <div className="sim-stat-value">{formatTime(summary.time_spent ?? 0)}</div>
                  <div className="sim-stat-label">Time</div>
                </div>
                <div className="sim-stat">
                  <div className="sim-stat-value">{summary.hints_used ?? 0}</div>
                  <div className="sim-stat-label">Hints used</div>
                </div>
                <div className="sim-stat">
                  <div className="sim-stat-value">{summary.incorrect_decisions}</div>
                  <div className="sim-stat-label">Incorrect</div>
                </div>
                <div className="sim-stat">
                  <div className="sim-stat-value">{summary.total_steps}</div>
                  <div className="sim-stat-label">Steps</div>
                </div>
              </div>
            )}

            <div className="sim-result-actions">
              <button
                className="sim-result-primary-btn"
                onClick={() => navigate(exitAfterSim)}
              >
                {returnToPath ? 'Return to course' : 'Back to simulations'}
              </button>
              <button
                className="sim-result-secondary-btn"
                onClick={() => navigate('/dashboard/analytics')}
              >
                View Analytics
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── No step data ─────────────────────────────────────────────────────────
  if (!currentStep) {
    return (
      <div className="sim-player">
<div className="sim-no-step">
          <span style={{ fontSize: '2.5rem' }}>⚠️</span>
          <p>Unable to load the current simulation step.</p>
          <button className="sim-result-secondary-btn" onClick={() => navigate(exitAfterSim)}>
            {returnToPath ? 'Return to course' : 'Return to simulations'}
          </button>
        </div>
      </div>
    );
  }

  // ── Player ───────────────────────────────────────────────────────────────
  return (
    <div className="sim-player">
{/* Header */}
      <div className="sim-header">
        <div className="sim-header-left">
          <button className="sim-back-btn" onClick={() => navigate(exitAfterSim)}>
            ← Exit
          </button>
          <span className="sim-scenario-name">{session?.scenario?.title ?? 'Simulation'}</span>
        </div>
        <div className="sim-header-right">
          <span className="sim-step-badge">
            Step {currentStep.number} of {totalSteps}
          </span>
          <span className={`sim-timer sim-timer-${timerUrgency}`}>
            {timeLeft !== null ? '⏱' : '⏲'} {timerDisplay}
          </span>
          {(session?.score ?? 0) > 0 && (
            <span className="sim-score-badge">{Math.round(session!.score ?? 0)} pts</span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="sim-progress-track">
        <div className="sim-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {/* Content */}
      <div className="sim-content">
        <div className="sim-card">
          {/* Threat context */}
          {session?.scenario?.threat_type_display && (
            <div className="sim-threat-context">
              <span className="sim-threat-icon">⚠️</span>
              <span className="sim-threat-text">
                <strong>Threat type:</strong> {session.scenario.threat_type_display}
                {session.scenario.category_display && ` · ${session.scenario.category_display}`}
              </span>
            </div>
          )}

          <div className="sim-step-number">Step {currentStep.number}</div>
          <h2 className="sim-step-title">{currentStep.title}</h2>
          <p className="sim-step-description">{currentStep.description}</p>

          {/* Hint */}
          {hint && (
            <div className="sim-hint-box">
              <span>💡</span>
              <span>{hint}</span>
            </div>
          )}

          {/* Feedback */}
          {feedback && (
            <div className={`sim-feedback ${feedback.correct ? 'correct' : 'incorrect'}`}>
              <span>{feedback.correct ? '✓' : '✗'}</span>
              <span>{feedback.message}</span>
            </div>
          )}

          {/* Options */}
          <div className="sim-options-label">Choose your response</div>
          <div className="sim-options">
            {currentStep.options.map((opt: StepOption, i: number) => {
              const key = KEYS[i] ?? String(i + 1);
              const isSelected = selectedOption === opt.id;
              const isCorrect = feedback?.correct && isSelected;
              const isWrong = feedback && !feedback.correct && isSelected;

              return (
                <button
                  key={String(opt.id)}
                  className={[
                    'sim-option',
                    isSelected ? 'selected' : '',
                    isCorrect ? 'correct' : '',
                    isWrong ? 'incorrect' : '',
                    optionDisabled && !isSelected ? 'disabled' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => !optionDisabled && setSelectedOption(opt.id)}
                  disabled={optionDisabled && !isSelected}
                >
                  <span className="sim-option-key">{key}</span>
                  <span className="sim-option-text">{opt.text ?? opt.label ?? String(opt.id)}</span>
                </button>
              );
            })}
          </div>

          {/* Actions */}
          <div className="sim-actions">
            <button
              className="sim-submit-btn"
              onClick={handleSubmit}
              disabled={!selectedOption || submitting || showFeedback}
            >
              {submitting ? (
                <>
                  <span className="sim-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                  Evaluating…
                </>
              ) : (
                'Submit Decision'
              )}
            </button>
            <button
              className="sim-hint-btn"
              onClick={handleHint}
              disabled={loadingHint || hintsRemaining <= 0 || showFeedback}
              title={hintsRemaining <= 0 ? 'No hints remaining' : `${hintsRemaining} hints left`}
            >
              💡 Hint {hintsRemaining > 0 ? `(${hintsRemaining})` : ''}
            </button>
            <button className="sim-abandon-btn" onClick={handleAbandon}>
              Abandon
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SimulationPlayerPage;
