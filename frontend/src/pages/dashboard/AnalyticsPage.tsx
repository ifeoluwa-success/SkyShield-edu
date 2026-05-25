// src/pages/dashboard/DashboardAnalyticsPage.tsx
import React, { useState, useEffect } from 'react';
import { getAllSessions, getUserCertifications } from '../../services/simulationService';
import {
  getUserPerformance,
  getSkillAssessments,
  getComparisonStats,
  getPerformanceTrends,
  type UserPerformance,
  type SkillAssessment,
  type ComparisonStats,
  type PerformanceTrend,
} from '../../services/analyticsService';
import { showToast } from '../../lib/toast';
import { PageLoader } from '../../components/ui/Loading';
import '../../assets/css/AnalyticsPage.css';

interface DashboardStats {
  totalSimulations: number;
  avgScore: number;
  certificationsEarned: number;
  totalHours: number;
  weeklyProgress: { day: string; count: number }[];
  completionRate: number;
  performanceTrend: { date: string; score: number }[];
}

const DashboardAnalyticsPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [performance, setPerformance] = useState<UserPerformance | null>(null);
  const [skills, setSkills] = useState<SkillAssessment[]>([]);
  const [comparison, setComparison] = useState<ComparisonStats | null>(null);
  const [trends, setTrends] = useState<PerformanceTrend[]>([]);
useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setLoading(true);

        // Fetch all data in parallel; analytics endpoints may not exist yet so we silence their errors
        const [allSessions, certifications, perfResult, skillsResult, compResult, trendsResult] =
          await Promise.allSettled([
            getAllSessions(),
            getUserCertifications(),
            getUserPerformance(),
            getSkillAssessments(),
            getComparisonStats(),
            getPerformanceTrends({ period: 'daily', days: 30 }),
          ]);

        const sessions = allSessions.status === 'fulfilled' ? allSessions.value : [];
        const certs = certifications.status === 'fulfilled' ? certifications.value : [];

        if (perfResult.status === 'fulfilled') setPerformance(perfResult.value);
        if (skillsResult.status === 'fulfilled') setSkills(skillsResult.value);
        if (compResult.status === 'fulfilled') setComparison(compResult.value);
        if (trendsResult.status === 'fulfilled') setTrends(trendsResult.value);

        const completedCerts = certs.filter(c => c.status === 'completed').length;
        const completedSessions = sessions.filter(s => s.status === 'completed');
        const totalSimulations = completedSessions.length;
        const avgScore =
          totalSimulations > 0
            ? Math.round(
                completedSessions.reduce((sum, s) => sum + (s.score || 0), 0) / totalSimulations,
              )
            : 0;
        const totalSeconds = sessions.reduce((sum, s) => sum + s.time_spent, 0);
        const totalHours = Math.round(totalSeconds / 3600);

        const today = new Date();
        const weeklyData: Record<string, number> = {};
        for (let i = 6; i >= 0; i--) {
          const d = new Date(today);
          d.setDate(today.getDate() - i);
          weeklyData[d.toLocaleDateString('en-US', { weekday: 'short' })] = 0;
        }
        completedSessions.forEach(session => {
          if (session.completed_at) {
            const completed = new Date(session.completed_at);
            const diff = Math.floor((today.getTime() - completed.getTime()) / 86_400_000);
            if (diff >= 0 && diff < 7) {
              const key = completed.toLocaleDateString('en-US', { weekday: 'short' });
              weeklyData[key] = (weeklyData[key] || 0) + 1;
            }
          }
        });

        const trendMap: Record<string, { total: number; count: number }> = {};
        for (let i = 6; i >= 0; i--) {
          const d = new Date(today);
          d.setDate(today.getDate() - i);
          trendMap[d.toISOString().split('T')[0]] = { total: 0, count: 0 };
        }
        completedSessions.forEach(session => {
          if (session.completed_at && session.score) {
            const key = session.completed_at.split('T')[0];
            if (trendMap[key]) {
              trendMap[key].total += session.score;
              trendMap[key].count += 1;
            }
          }
        });

        const passedCount = completedSessions.filter(s => s.passed).length;

        setStats({
          totalSimulations,
          avgScore,
          certificationsEarned: completedCerts,
          totalHours,
          weeklyProgress: Object.entries(weeklyData).map(([day, count]) => ({ day, count })),
          completionRate:
            totalSimulations > 0 ? Math.round((passedCount / totalSimulations) * 100) : 0,
          performanceTrend: Object.entries(trendMap).map(([date, { total, count }]) => ({
            date,
            score: count > 0 ? Math.round(total / count) : 0,
          })),
        });
      } catch {
        showToast({ type: 'error', message: 'Failed to load analytics data' });
        setStats({
          totalSimulations: 0, avgScore: 0, certificationsEarned: 0, totalHours: 0,
          weeklyProgress: [], completionRate: 0, performanceTrend: [],
        });
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, []);

  const maxWeeklyCount = Math.max(...(stats?.weeklyProgress.map(w => w.count) ?? [0]), 1);

  if (loading) {
    return (
      <div className="dashboard-page analytics-page loading">
        <PageLoader message="Loading analytics…" className="min-h-0 py-12" />
      </div>
    );
  }

  return (
    <div className="dashboard-page analytics-page">
<div className="welcome-header">
        <div className="welcome-content">
          <h1 className="welcome-title">
            Performance <span className="gradient-text">Analytics</span>
          </h1>
          <p className="welcome-subtitle">
            Deep insights into your learning progress and simulations
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <section className="analytics-kpis">
        <div className="kpi-card">
          <h4>Total Simulations</h4>
          <span className="kpi-value">{stats?.totalSimulations ?? 0}</span>
          <span className="kpi-trend neutral">Completed</span>
        </div>
        <div className="kpi-card">
          <h4>Avg Score</h4>
          <span className="kpi-value">
            {performance ? Math.round(performance.average_score) : (stats?.avgScore ?? 0)}%
          </span>
          <span className="kpi-trend neutral">Overall</span>
        </div>
        <div className="kpi-card">
          <h4>Certifications</h4>
          <span className="kpi-value">{stats?.certificationsEarned ?? 0}</span>
          <span className="kpi-trend neutral">Earned</span>
        </div>
        <div className="kpi-card">
          <h4>Training Hours</h4>
          <span className="kpi-value">{stats?.totalHours ?? 0}h</span>
          <span className="kpi-trend neutral">Total time</span>
        </div>
      </section>

      {/* Charts */}
      <section className="analytics-grid">
        {/* Weekly Training Progress */}
        <div className="analytics-card">
          <h3>Weekly Training Progress</h3>
          <div className="bar-chart">
            {(stats?.weeklyProgress.length ? stats.weeklyProgress : [
              'Mon','Tue','Wed','Thu','Fri','Sat','Sun',
            ].map(day => ({ day, count: 0 }))).map(item => (
              <div key={item.day} className="bar-item">
                <div
                  className="bar-fill"
                  style={{ height: `${(item.count / maxWeeklyCount) * 100}%` }}
                />
                <span>{item.day}</span>
                <small>{item.count}</small>
              </div>
            ))}
          </div>
        </div>

        {/* Completion Rate */}
        <div className="analytics-card">
          <h3>Completion Rate</h3>
          <div className="circle-chart">
            <svg viewBox="0 0 36 36">
              <path
                className="circle-bg"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="circle-progress"
                strokeDasharray={`${stats?.completionRate ?? 0}, 100`}
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <div className="circle-value">
              <span>{stats?.completionRate ?? 0}%</span>
              <small>Passed</small>
            </div>
          </div>
        </div>

        {/* Performance Trend */}
        <div className="analytics-card wide">
          <h3>Performance Trend (Last 7 Days)</h3>
          <div className="line-chart">
            {stats?.performanceTrend && stats.performanceTrend.length > 0 ? (
              <div className="line-chart-container">
                <svg viewBox="0 0 600 200" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#8b5cf6" />
                      <stop offset="100%" stopColor="#3b82f6" />
                    </linearGradient>
                  </defs>
                  <polyline
                    className="line-path"
                    points={stats.performanceTrend
                      .map((p, i) => {
                        const x = (i / (stats.performanceTrend.length - 1)) * 600;
                        const y = 200 - (p.score / 100) * 180;
                        return `${x},${y}`;
                      })
                      .join(' ')}
                    fill="none"
                    stroke="url(#gradient)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div className="line-labels">
                  {stats.performanceTrend.map((p, i) => (
                    <div key={i} className="line-label">
                      <span>{new Date(p.date).toLocaleDateString(undefined, { weekday: 'short' })}</span>
                      <small>{p.score}%</small>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="empty-chart">No data available</div>
            )}
          </div>
        </div>
      </section>

      {/* Skills & Comparison (from analytics service) */}
      {(skills.length > 0 || performance || comparison) && (
        <section className="analytics-grid" style={{ marginTop: '1.5rem' }}>
          {/* Skill Assessments */}
          {skills.length > 0 && (
            <div className="analytics-card wide">
              <h3>Skill Assessments</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', marginTop: '1rem' }}>
                {skills.map(skill => (
                  <div key={skill.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.875rem' }}>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                        {skill.skill_display ?? skill.skill}
                      </span>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        Level {skill.level} · {Math.round(skill.score)}%
                      </span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-tertiary)' }}>
                      <div
                        style={{
                          height: '100%',
                          borderRadius: 3,
                          width: `${skill.progress}%`,
                          background: 'linear-gradient(90deg, #8b5cf6, #3b82f6)',
                          transition: 'width 0.5s ease',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Peer Comparison */}
          {comparison && (
            <div className="analytics-card">
              <h3>Peer Comparison</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.75rem' }}>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Your avg score</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {Math.round(comparison.user.avg_score)}%
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Global average</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {Math.round(comparison.global.avg_score)}%
                  </div>
                </div>
                <div style={{
                  background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(59,130,246,0.15))',
                  borderRadius: 10,
                  padding: '0.75rem',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#8b5cf6' }}>
                    Top {100 - Math.round(comparison.percentile)}%
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>of all trainees</div>
                </div>
              </div>
            </div>
          )}

          {/* Weak & Strong Areas */}
          {performance && (
            <div className="analytics-card">
              <h3>Focus Areas</h3>
              <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {performance.strong_areas.length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#10b981', marginBottom: '0.4rem' }}>
                      Strong Areas
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      {performance.strong_areas.map(area => (
                        <span key={area} style={{
                          background: 'rgba(16,185,129,0.1)',
                          color: '#10b981',
                          border: '1px solid rgba(16,185,129,0.3)',
                          borderRadius: 6,
                          padding: '0.2rem 0.6rem',
                          fontSize: '0.8rem',
                        }}>
                          {area}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {performance.weak_areas.length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f59e0b', marginBottom: '0.4rem' }}>
                      Needs Improvement
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      {performance.weak_areas.map(area => (
                        <span key={area} style={{
                          background: 'rgba(245,158,11,0.1)',
                          color: '#f59e0b',
                          border: '1px solid rgba(245,158,11,0.3)',
                          borderRadius: 6,
                          padding: '0.2rem 0.6rem',
                          fontSize: '0.8rem',
                        }}>
                          {area}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Server-side performance trends */}
      {trends.length > 0 && (
        <section style={{ marginTop: '1.5rem' }}>
          <div className="analytics-card wide">
            <h3>Daily Performance (Last 30 Days)</h3>
            <div className="trends-table-wrap" style={{ overflowX: 'auto', marginTop: '0.75rem' }}>
              <table className="trends-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Avg Score</th>
                    <th>Simulations</th>
                    <th>Time (min)</th>
                    <th>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {trends.slice().reverse().slice(0, 14).map(t => (
                    <tr key={t.id}>
                      <td>{new Date(t.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td>
                      <td>{Math.round(t.average_score)}%</td>
                      <td>{t.simulations_completed}</td>
                      <td>{Math.round(t.total_time / 60)}</td>
                      <td>
                        {t.improvement > 0
                          ? <span style={{ color: 'var(--success)', fontWeight: 600 }}>+{t.improvement.toFixed(1)}%</span>
                          : t.improvement < 0
                            ? <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{t.improvement.toFixed(1)}%</span>
                            : <span style={{ color: 'var(--text-muted)' }}>—</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default DashboardAnalyticsPage;
