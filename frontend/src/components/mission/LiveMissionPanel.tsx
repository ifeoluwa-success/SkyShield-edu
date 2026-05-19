import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { IncidentEvent, MissionPhase } from '../../types/incident';
import { applyIntervention } from '../../services/incidentService';
import { useMissionSocket } from '../../hooks/useMissionSocket';
import { ParticipantBadges } from './ParticipantBadges';
import { EventFeed } from './EventFeed';
import Toast from '../Toast';

interface LiveMissionPanelProps {
  runId: string;
  token: string;
  onClose: () => void;
}

type ConfirmState =
  | { kind: 'none' }
  | { kind: 'pause' }
  | { kind: 'reduce_timer' }
  | { kind: 'inject_threat' }
  | { kind: 'force_phase' };

const formatMMSS = (seconds: number | null) => {
  if (seconds == null) return '--:--';
  const s = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
};

export const LiveMissionPanel: React.FC<LiveMissionPanelProps> = ({ runId, token, onClose }) => {
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>({ kind: 'none' });

  const [injectLabel, setInjectLabel] = useState('Threat Inject');
  const [injectSeverity, setInjectSeverity] = useState(3);
  const [targetPhase, setTargetPhase] = useState<MissionPhase>('investigation');

  const eventsRef = useRef<ReturnType<typeof useMissionSocket>['lastEvent'][]>([]);
  const [events, setEvents] = useState<ReturnType<typeof useMissionSocket>['lastEvent'][]>([]);

  const { missionState, connectionStatus, lastEvent, retryConnection } = useMissionSocket({ runId, token });

  useEffect(() => {
    if (!lastEvent) return;
    const next = [lastEvent, ...(eventsRef.current as (typeof lastEvent)[])].slice(0, 10);
    eventsRef.current = next;
    setEvents(next);
  }, [lastEvent]);

  useEffect(() => {
    const base = missionState?.last_5_events ?? [];
    if (base.length === 0) return;
    const merged = [...base]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10);
    eventsRef.current = merged;
    setEvents(merged);
  }, [missionState?.last_5_events]);

  const phase = missionState?.phase ?? 'briefing';
  const timeRemaining = missionState?.time_remaining ?? missionState?.run?.time_remaining ?? null;
  const score = missionState?.score_so_far ?? missionState?.run?.score ?? 0;

  const runShort = useMemo(() => (runId.length > 10 ? `${runId.slice(0, 8)}…${runId.slice(-4)}` : runId), [runId]);

  const fire = useCallback(
    async (kind: ConfirmState['kind']) => {
      try {
        if (kind === 'pause') {
          await applyIntervention(runId, { type: 'PAUSE' });
          setToast({ type: 'success', message: 'Mission paused' });
        } else if (kind === 'reduce_timer') {
          await applyIntervention(runId, { type: 'REDUCE_TIMER' });
          setToast({ type: 'success', message: 'Timer reduced' });
        } else if (kind === 'inject_threat') {
          await applyIntervention(runId, {
            type: 'INJECT_THREAT',
            data: { label: injectLabel, severity: injectSeverity },
          });
          setToast({ type: 'success', message: 'Threat injected' });
        } else if (kind === 'force_phase') {
          await applyIntervention(runId, {
            type: 'FORCE_PHASE',
            data: { target_phase: targetPhase },
          });
          setToast({ type: 'success', message: `Forced phase → ${targetPhase}` });
        }
      } catch {
        setToast({ type: 'error', message: 'Intervention failed' });
      } finally {
        setConfirm({ kind: 'none' });
      }
    },
    [injectLabel, injectSeverity, runId, targetPhase],
  );

  const confirmRow = (kind: ConfirmState['kind']) => (
    <div className="mt-2 flex items-center justify-end gap-2">
      <span className="mr-auto text-xs text-slate-400">Are you sure?</span>
      <button
        type="button"
        className="rounded-md border border-slate-700/60 bg-slate-950/30 px-3 py-2 text-xs text-slate-200 hover:bg-slate-900/30 transition"
        onClick={() => setConfirm({ kind: 'none' })}
      >
        CANCEL
      </button>
      <button
        type="button"
        className="rounded-md border border-red-500/60 bg-red-500/10 px-3 py-2 text-xs text-red-200 hover:bg-red-500/15 transition"
        onClick={() => void fire(kind)}
      >
        CONFIRM
      </button>
    </div>
  );

  return (
    <div
      className="fixed right-0 top-0 z-50 h-screen w-[400px] border-l border-slate-800/70 bg-[#0a0f1e] p-4 shadow-2xl"
      style={{ fontFamily: "'Courier New', monospace" }}
    >
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs tracking-[0.22em] text-slate-300">WAR ROOM</div>
          <div className="mt-1 text-sm text-slate-100">RUN {runShort}</div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{
              backgroundColor:
                connectionStatus === 'connected'
                  ? '#22c55e'
                  : connectionStatus === 'disconnected'
                    ? '#64748b'
                    : '#f59e0b',
            }}
            title={connectionStatus}
          />
          {connectionStatus === 'failed' ? (
            <button
              type="button"
              className="rounded-md border border-amber-500/40 px-2 py-1 text-[10px] text-amber-200"
              onClick={() => retryConnection()}
            >
              Retry
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-700/60 bg-slate-950/30 px-2 py-1 text-xs text-slate-200 hover:bg-slate-900/30 transition"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-800/70 bg-slate-950/30 p-4">
        <div className="text-xs tracking-[0.22em] text-slate-300">LIVE STATE</div>
        <div className="mt-2 text-2xl text-amber-200">{phase.toUpperCase()}</div>
        <div className="mt-2 flex items-center justify-between text-xs text-slate-200">
          <span>TIME</span>
          <span className={timeRemaining != null && timeRemaining < 15 ? 'text-red-200 animate-pulse' : ''}>
            {formatMMSS(timeRemaining)}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between text-xs text-slate-200">
          <span>SCORE</span>
          <span className="text-amber-200">{score}</span>
        </div>
        <div className="mt-3">
          <ParticipantBadges participants={missionState?.participants ?? []} />
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-800/70 bg-slate-950/30 p-4">
        <div className="mb-2 text-xs tracking-[0.22em] text-slate-300">LIVE EVENTS</div>
        <div className="h-[260px] overflow-y-auto pr-1">
          <EventFeed
            events={events.filter((e): e is IncidentEvent => e != null)}
            maxVisible={10}
          />
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-800/70 bg-slate-950/30 p-4">
        <div className="text-xs tracking-[0.22em] text-amber-300">SUPERVISOR CONTROLS</div>

        <div className="mt-3 space-y-3">
          <div>
            <button
              type="button"
              className="w-full rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 hover:bg-amber-500/15 transition"
              onClick={() => setConfirm({ kind: confirm.kind === 'pause' ? 'none' : 'pause' })}
            >
              PAUSE MISSION
            </button>
            {confirm.kind === 'pause' && confirmRow('pause')}
          </div>

          <div className="rounded-xl border border-slate-800/60 bg-slate-950/20 p-3">
            <div className="text-xs text-slate-300">INJECT THREAT</div>
            <div className="mt-2 grid grid-cols-1 gap-2">
              <input
                value={injectLabel}
                onChange={e => setInjectLabel(e.target.value)}
                className="w-full rounded-lg border border-slate-700/60 bg-slate-950/30 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-500/60"
                placeholder="Label"
              />
              <select
                value={injectSeverity}
                onChange={e => setInjectSeverity(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700/60 bg-slate-950/30 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-500/60"
              >
                {[1, 2, 3, 4, 5].map(v => (
                  <option key={v} value={v}>
                    Severity {v}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="w-full rounded-lg border border-purple-500/50 bg-purple-500/10 px-4 py-3 text-sm text-purple-200 hover:bg-purple-500/15 transition"
                onClick={() =>
                  setConfirm({ kind: confirm.kind === 'inject_threat' ? 'none' : 'inject_threat' })
                }
              >
                INJECT THREAT
              </button>
              {confirm.kind === 'inject_threat' && confirmRow('inject_threat')}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800/60 bg-slate-950/20 p-3">
            <div className="text-xs text-slate-300">FORCE PHASE</div>
            <div className="mt-2 grid grid-cols-1 gap-2">
              <select
                value={targetPhase}
                onChange={e => setTargetPhase(e.target.value as MissionPhase)}
                className="w-full rounded-lg border border-slate-700/60 bg-slate-950/30 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-500/60"
              >
                {(['briefing', 'detection', 'investigation', 'containment', 'recovery', 'review'] as MissionPhase[]).map(
                  p => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ),
                )}
              </select>
              <button
                type="button"
                className="w-full rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 hover:bg-amber-500/15 transition"
                onClick={() => setConfirm({ kind: confirm.kind === 'force_phase' ? 'none' : 'force_phase' })}
              >
                FORCE PHASE
              </button>
              {confirm.kind === 'force_phase' && confirmRow('force_phase')}
            </div>
          </div>

          <div>
            <button
              type="button"
              className="w-full rounded-lg border border-red-500/60 bg-red-500/10 px-4 py-3 text-sm text-red-200 hover:bg-red-500/15 transition"
              onClick={() =>
                setConfirm({ kind: confirm.kind === 'reduce_timer' ? 'none' : 'reduce_timer' })
              }
            >
              REDUCE TIMER
            </button>
            {confirm.kind === 'reduce_timer' && confirmRow('reduce_timer')}
          </div>
        </div>
      </div>
    </div>
  );
};

