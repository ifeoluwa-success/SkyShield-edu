import React from 'react';
import type { MissionParticipant } from '../../types/incident';

interface ParticipantBadgesProps {
  participants: MissionParticipant[];
  variant?: 'cockpit' | 'studio';
  /** Logged-in user — used for "(you)" and optional socket-aware online for self */
  currentUserEmail?: string;
  currentUserUsername?: string;
  /** True when this client has an open mission WebSocket (used to show self as Live when API lags) */
  socketConnected?: boolean;
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const norm = (s: string | undefined) => (s ?? '').trim().toLowerCase();

function isSameUser(p: MissionParticipant, email?: string, username?: string): boolean {
  const pe = norm(p.email);
  const pu = norm(p.username);
  return Boolean((email && pe === norm(email)) || (username && pu === norm(username)));
}

function participantOnline(
  p: MissionParticipant,
  isMe: boolean,
  socketConnected: boolean | undefined,
): boolean {
  if (isMe && socketConnected) return true;
  return Boolean(p.is_active);
}

export const ParticipantBadges: React.FC<ParticipantBadgesProps> = ({
  participants,
  variant = 'cockpit',
  currentUserEmail,
  currentUserUsername,
  socketConnected,
}) => {
  const studio = variant === 'studio';
  return (
    <div
      className={[
        'rounded-xl border p-3',
        studio
          ? 'border-slate-700/80 bg-slate-900/60 shadow-inner dark:border-slate-700 dark:bg-slate-900/70'
          : 'border-slate-800/70 bg-slate-950/40',
      ].join(' ')}
      style={studio ? { fontFamily: 'ui-sans-serif, system-ui, sans-serif' } : { fontFamily: "'Courier New', monospace" }}
    >
      <div
        className={
          studio
            ? 'mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-widest text-slate-400'
            : 'mb-2 text-xs tracking-[0.22em] text-slate-300'
        }
      >
        <span>Operators</span>
        <span className="font-mono text-[10px] font-normal normal-case tracking-normal text-slate-500">
          {participants.length} linked
        </span>
      </div>

      {participants.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-700/80 bg-slate-950/40 px-3 py-4 text-center">
          <p className="text-xs text-slate-400">No operators in this run yet.</p>
          <p className="mt-1 text-[11px] text-slate-500">Joining should register you — pull to refresh or wait a moment.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {participants.map(p => {
            const me = isSameUser(p, currentUserEmail, currentUserUsername);
            const online = participantOnline(p, me, socketConnected);
            return (
              <li
                key={p.id}
                className={
                  studio
                    ? 'flex items-center justify-between gap-2 rounded-lg border border-slate-700/60 bg-slate-950/50 px-3 py-2'
                    : 'flex items-center justify-between gap-2 rounded-lg border border-slate-700/60 bg-slate-900/30 px-3 py-2'
                }
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span
                      className={[
                        'absolute inset-0 rounded-full',
                        online ? 'bg-emerald-500 opacity-75 animate-ping' : 'bg-transparent',
                      ].join(' ')}
                    />
                    <span
                      className={[
                        'relative inline-flex h-2.5 w-2.5 rounded-full ring-2 ring-offset-1',
                        online
                          ? 'bg-emerald-500 ring-emerald-500/40 ring-offset-slate-950'
                          : 'bg-slate-600 ring-slate-600/30 ring-offset-slate-950',
                      ].join(' ')}
                    />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                      <span className={studio ? 'truncate text-xs font-medium text-slate-100' : 'truncate text-xs text-slate-200'}>
                        {truncate(p.username || p.email || 'operator', 18)}
                      </span>
                      {me && (
                        <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                          You
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-500">{p.role.replace(/_/g, ' ')}</div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className={[
                      'text-[10px] font-semibold uppercase tracking-wide',
                      online ? 'text-emerald-400' : 'text-slate-500',
                    ].join(' ')}
                  >
                    {online ? 'Live' : 'Away'}
                  </span>
                  {p.is_ready && (
                    <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-200">
                      Ready
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

