import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, Award, Target, TrendingUp } from 'lucide-react';
import { getAllSessions } from '../../services/simulationService';
import { getUserPerformance, type UserPerformance } from '../../services/analyticsService';
import type { SimulationSession } from '../../types/simulation';
import { showToast } from '../../lib/toast';
import { PageLoader } from '../../components/ui/Loading';
import '../../assets/css/ReportsPage.css';

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function statusLabel(status: SimulationSession['status']): string {
  switch (status) {
    case 'completed': return 'Completed';
    case 'failed': return 'Failed';
    case 'in_progress': return 'In Progress';
    case 'abandoned': return 'Abandoned';
    default: return 'Not Started';
  }
}

const ReportsPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<SimulationSession[]>([]);
  const [performance, setPerformance] = useState<UserPerformance | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('');

  useEffect(() => {
    const fetch = async () => {
      try {
        const [sessionData, perfData] = await Promise.allSettled([
          getAllSessions(),
          getUserPerformance(),
        ]);
        if (sessionData.status === 'fulfilled') setSessions(sessionData.value);
        if (perfData.status === 'fulfilled') setPerformance(perfData.value);
      } catch {
        showToast({ type: 'error', message: 'Failed to load report data.' });
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const completed = sessions.filter(s => s.status === 'completed');
  const passed = completed.filter(s => s.passed);
  const avgScore = completed.length > 0
    ? Math.round(completed.reduce((sum, s) => sum + (s.score ?? 0), 0) / completed.length)
    : 0;
  const totalSeconds = sessions.reduce((sum, s) => sum + s.time_spent, 0);

  const filtered = filterStatus
    ? sessions.filter(s => s.status === filterStatus)
    : sessions;

  if (loading) {
    return (
      <div className="dashboard-page loading">
        <PageLoader message="Loading reports…" className="min-h-0 py-16" />
      </div>
    );
  }

  return (
    <div className="dashboard-page reports-page">
<div className="page-header">
        <h1>Performance Report</h1>
        <p>Your simulation history, scores, and learning progress</p>
      </div>

      {/* Summary cards */}
      <div className="reports-summary">
        <div className="report-stat-card">
          <div className="report-stat-icon blue">
            <Target size={22} />
          </div>
          <div>
            <div className="report-stat-value">{completed.length}</div>
            <div className="report-stat-label">Completed</div>
          </div>
        </div>

        <div className="report-stat-card">
          <div className="report-stat-icon green">
            <TrendingUp size={22} />
          </div>
          <div>
            <div className="report-stat-value">{avgScore}%</div>
            <div className="report-stat-label">Avg Score</div>
          </div>
        </div>

        <div className="report-stat-card">
          <div className="report-stat-icon purple">
            <Award size={22} />
          </div>
          <div>
            <div className="report-stat-value">
              {completed.length > 0
                ? Math.round((passed.length / completed.length) * 100)
                : 0}%
            </div>
            <div className="report-stat-label">Pass Rate</div>
          </div>
        </div>

        <div className="report-stat-card">
          <div className="report-stat-icon yellow">
            <Clock size={22} />
          </div>
          <div>
            <div className="report-stat-value">{formatDuration(totalSeconds)}</div>
            <div className="report-stat-label">Total Training</div>
          </div>
        </div>
      </div>

      {/* Performance insights */}
      {performance && (performance.weak_areas.length > 0 || performance.strong_areas.length > 0) && (
        <div className="reports-insights">
          {performance.strong_areas.length > 0 && (
            <div className="insight-section">
              <span className="insight-label insight-strong">Strong Areas</span>
              <div className="insight-tags">
                {performance.strong_areas.map(a => (
                  <span key={a} className="insight-tag tag-strong">{a}</span>
                ))}
              </div>
            </div>
          )}
          {performance.weak_areas.length > 0 && (
            <div className="insight-section">
              <span className="insight-label insight-weak">Needs Improvement</span>
              <div className="insight-tags">
                {performance.weak_areas.map(a => (
                  <span key={a} className="insight-tag tag-weak">{a}</span>
                ))}
              </div>
            </div>
          )}
          {performance.recommended_difficulty && (
            <div className="insight-section">
              <span className="insight-label">Recommended Difficulty</span>
              <span className="insight-tag tag-info">{performance.recommended_difficulty}</span>
            </div>
          )}
        </div>
      )}

      {/* Session history table */}
      <div className="reports-table-card">
        <div className="reports-table-header">
          <h2>Simulation History</h2>
          <select
            className="reports-filter"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="in_progress">In Progress</option>
            <option value="abandoned">Abandoned</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="reports-empty">
            <Target size={40} />
            <p>{filterStatus ? 'No sessions match this filter.' : 'No simulation sessions yet. Start a simulation to track your progress.'}</p>
          </div>
        ) : (
          <div className="users-table">
            <table>
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>Accuracy</th>
                  <th>Time Spent</th>
                  <th>Hints Used</th>
                  <th>Completed</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {s.scenario?.title ?? 'Unknown Scenario'}
                      </div>
                      {s.scenario?.category_display && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {s.scenario.category_display}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`status-badge status-${s.status}`}>
                        {s.status === 'completed'
                          ? (s.passed ? <><CheckCircle size={13} /> {statusLabel(s.status)}</> : <><XCircle size={13} /> {statusLabel(s.status)}</>)
                          : statusLabel(s.status)}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        fontWeight: 700,
                        color: s.score != null
                          ? s.score >= 70 ? '#10b981' : s.score >= 50 ? '#f59e0b' : '#ef4444'
                          : 'var(--text-secondary)',
                      }}>
                        {s.score != null ? `${Math.round(s.score)}%` : '—'}
                      </span>
                    </td>
                    <td>{s.accuracy_rate != null ? `${Math.round(s.accuracy_rate)}%` : '—'}</td>
                    <td>{formatDuration(s.time_spent)}</td>
                    <td>{s.hints_used}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                      {formatDate(s.completed_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportsPage;
