import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import DashboardLayout from '../../components/DashboardLayout';
import { useAuth } from '../../hooks/useAuth';
import type { IncidentRun, SupervisorIntervention } from '../../types/incident';
import { applyIntervention, getActiveRuns } from '../../services/incidentService';
import { showToast } from '../../lib/toast';
import { MissionCard } from '../../components/mission/MissionCard';
import { LiveMissionPanel } from '../../components/mission/LiveMissionPanel';

const fmtTime = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export const SupervisorWarRoomPage: React.FC = () => {
  const { user } = useAuth();
  const isAllowed = user?.role === 'supervisor' || user?.role === 'admin';

  const [activeRuns, setActiveRuns] = useState<IncidentRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [interventionModal] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
const token = useMemo(() => localStorage.getItem('access_token') ?? '', []);

  useEffect(() => {
    let mounted = true;
    const fetchRuns = async () => {
      try {
        const runs = await getActiveRuns();
        if (!mounted) return;
        setActiveRuns(runs);
        setLastUpdated(new Date());
      } catch {
        if (!mounted) return;
        showToast({ type: 'error', message: 'Failed to load active missions' });
      }
    };

    void fetchRuns();
    const id = window.setInterval(() => void fetchRuns(), 10_000);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, []);

  const handleIntervene = async (runId: string, intervention: SupervisorIntervention) => {
    try {
      await applyIntervention(runId, intervention);
      showToast({ type: 'success', message: `Intervention applied: ${intervention.type}` });
    } catch {
      showToast({ type: 'error', message: 'Intervention failed' });
    }
  };

  if (!isAllowed) return <Navigate to="/dashboard" replace />;

  return (
    <DashboardLayout>
      <div className="relative" style={{ fontFamily: "'Courier New', monospace" }}>
<div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-2xl font-bold text-slate-100 tracking-wide">COMMAND CENTER</div>
            <div className="mt-1 text-xs text-slate-400">
              Last updated: {lastUpdated ? fmtTime(lastUpdated) : '—'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-amber-500/50 bg-amber-500/10 px-3 py-1 text-xs text-amber-200">
              LIVE MISSIONS: {activeRuns.length}
            </span>
            {interventionModal ? null : null}
          </div>
        </div>

        {activeRuns.length === 0 ? (
          <div className="rounded-2xl border border-slate-800/70 bg-slate-950/30 p-10 text-center text-slate-300">
            No active missions
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {activeRuns.map(run => (
              <MissionCard key={run.id} run={run} onSelect={setSelectedRunId} onIntervene={handleIntervene} />
            ))}
          </div>
        )}

        {selectedRunId && (
          <LiveMissionPanel
            runId={selectedRunId}
            token={token}
            onClose={() => setSelectedRunId(null)}
          />
        )}
      </div>
    </DashboardLayout>
  );
};

export default SupervisorWarRoomPage;

