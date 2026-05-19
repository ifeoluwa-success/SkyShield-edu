import React, { useMemo, useState } from 'react';
import { PlayCircle, Clock, Award, Sparkles } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getScenarios, startSimulation, getCurrentSession } from '../../services/simulationService';
import type { Scenario, SimulationSession } from '../../types/simulation';
import Toast from '../../components/Toast';
import { ContentGridSkeleton } from '../../components/ui/ContentGridSkeleton';
import { queryKeys } from '../../lib/queryClient';
import '../../assets/css/Simulationdash.css';
import { startMissionRun } from '../../services/incidentService';
import { useAuth } from '../../hooks/useAuth';

async function fetchSessionsForScenarios(
  scenarios: Scenario[],
): Promise<Map<string, SimulationSession>> {
  const pairs = await Promise.all(
    scenarios.map(async (scenario) => {
      try {
        const session = await getCurrentSession(scenario.id);
        return session ? ([scenario.id, session] as const) : null;
      } catch {
        return null;
      }
    }),
  );
  return new Map(pairs.filter((p): p is [string, SimulationSession] => p !== null));
}

const DashboardSimulationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [filterDifficulty, setFilterDifficulty] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [launchingScenarioId, setLaunchingScenarioId] = useState<string | null>(null);

  const filters = useMemo(
    () => ({ difficulty: filterDifficulty, category: filterCategory }),
    [filterDifficulty, filterCategory],
  );

  const scenariosQuery = useQuery({
    queryKey: queryKeys.simulations.scenarios(filters),
    queryFn: () =>
      getScenarios({
        difficulty: filterDifficulty || undefined,
        category: filterCategory || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  const scenarios = scenariosQuery.data ?? [];
  const scenarioIds = useMemo(() => scenarios.map((s) => s.id), [scenarios]);

  const sessionsQuery = useQuery({
    queryKey: queryKeys.simulations.sessionsMap(scenarioIds),
    queryFn: () => fetchSessionsForScenarios(scenarios),
    enabled: scenarios.length > 0,
    staleTime: 30_000,
  });

  const userSessions = sessionsQuery.data ?? new Map<string, SimulationSession>();

  const operatorRole = useMemo(() => {
    const role = (user as unknown as { role?: string } | null)?.role ?? '';
    const r = role.toLowerCase();
    if (r === 'support_operator' || r === 'operations_officer') return 'support_operator';
    return 'lead_operator';
  }, [user]);

  const handleStartSimulation = async (scenarioId: string) => {
    try {
      const session = await startSimulation(scenarioId);
      navigate(`/dashboard/simulation/${session.id}`);
    } catch {
      setToast({ type: 'error', message: 'Failed to start simulation' });
    }
  };

  const handleLaunchMission = async (scenarioId: string) => {
    try {
      setLaunchingScenarioId(scenarioId);
      const result = await startMissionRun({ scenario_id: scenarioId, operator_role: operatorRole });
      navigate(`/dashboard/mission/${result.run_id}`);
    } catch {
      setToast({ type: 'error', message: 'Failed to launch mission' });
    } finally {
      setLaunchingScenarioId(null);
    }
  };

  const getDifficultyClass = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner':
        return 'easy';
      case 'intermediate':
        return 'medium';
      case 'advanced':
        return 'hard';
      case 'expert':
        return 'expert';
      default:
        return 'easy';
    }
  };

  const getCategoryIconClass = (category: string) => category.toLowerCase().replace(/\s/g, '-');

  const getProgress = (scenarioId: string): number => {
    const session = userSessions.get(scenarioId);
    if (!session) return 0;
    if (session.status === 'completed') return 100;
    return session.progress_percentage || 0;
  };

  const getStatus = (scenarioId: string): 'new' | 'in-progress' | 'completed' => {
    const session = userSessions.get(scenarioId);
    if (!session) return 'new';
    if (session.status === 'completed') return 'completed';
    if (session.status === 'in_progress') return 'in-progress';
    return 'new';
  };

  const showSkeleton = scenariosQuery.isLoading && !scenariosQuery.data;

  return (
    <div className="dashboard-page">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="welcome-header">
        <div className="welcome-content">
          <h1 className="welcome-title">
            Training <span className="gradient-text">Simulations</span>
          </h1>
          <p className="welcome-subtitle">Select a simulation to start your cybersecurity training</p>
        </div>
        <div className="welcome-actions">
          <div className="filter-group">
            <select
              className="filter-select"
              value={filterDifficulty}
              onChange={(e) => setFilterDifficulty(e.target.value)}
            >
              <option value="">All Difficulties</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
              <option value="expert">Expert</option>
            </select>
            <select
              className="filter-select"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="">All Categories</option>
              <option value="communication">Communication</option>
              <option value="navigation">Navigation</option>
              <option value="data_integrity">Data Integrity</option>
              <option value="social_engineering">Social Engineering</option>
              <option value="ransomware">Ransomware</option>
              <option value="unauthorized_access">Unauthorized Access</option>
            </select>
          </div>
        </div>
      </div>

      {scenariosQuery.isFetching && !showSkeleton && (
        <p className="filtering-hint">Refreshing scenarios…</p>
      )}

      {showSkeleton ? (
        <ContentGridSkeleton count={4} />
      ) : (
        <div className="simulations-grid">
          {scenarios.length === 0 ? (
            <div className="empty-state">No simulations available</div>
          ) : (
            scenarios.map((scenario) => {
              const progress = getProgress(scenario.id);
              const status = getStatus(scenario.id);
              return (
                <div key={scenario.id} className="simulation-card card-3d">
                  <div className="simulation-card-header">
                    <div className={`simulation-icon ${getCategoryIconClass(scenario.category)}`}>
                      <PlayCircle size={24} />
                    </div>
                    <div className="simulation-meta">
                      <span className={`difficulty-badge ${getDifficultyClass(scenario.difficulty)}`}>
                        {scenario.difficulty_display}
                      </span>
                      <span className="duration">
                        <Clock size={14} />
                        {scenario.estimated_time} min
                      </span>
                    </div>
                  </div>

                  <h3 className="simulation-title">{scenario.title}</h3>
                  <p className="simulation-category">{scenario.category_display}</p>

                  <div className="simulation-progress">
                    <div className="progress-label">
                      <span>Progress</span>
                      <span className="progress-value">{progress}%</span>
                    </div>
                    <div className="progress-bar">
                      <div className="bar-fill" style={{ width: `${progress}%` }} />
                    </div>
                  </div>

                  <div className="simulation-actions">
                    {status === 'completed' ? (
                      <button type="button" className="review-button">
                        <Award size={18} />
                        Review
                      </button>
                    ) : status === 'in-progress' ? (
                      <Link
                        to={`/dashboard/simulation/${userSessions.get(scenario.id)?.id}`}
                        className="continue-button"
                      >
                        <PlayCircle size={18} />
                        Continue
                      </Link>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => handleStartSimulation(scenario.id)}
                          className="start-button"
                        >
                          <PlayCircle size={18} />
                          Start Simulation
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLaunchMission(scenario.id)}
                          className="start-button"
                          disabled={launchingScenarioId === scenario.id}
                        >
                          <Sparkles size={18} />
                          {launchingScenarioId === scenario.id ? 'Launching...' : 'Launch Immersive Mission'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default DashboardSimulationsPage;
