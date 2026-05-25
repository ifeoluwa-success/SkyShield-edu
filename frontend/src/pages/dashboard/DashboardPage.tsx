// src/pages/dashboard/DashboardPage.tsx
import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Target,
  Clock,
  Award,
  AlertTriangle,
  CheckCircle,
  PlayCircle,
  BarChart3,
  Users,
  Calendar,
  Zap,
  Brain,
  Activity,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { getProfile } from '../../services/authService';
import { getAllSessions } from '../../services/simulationService';
import {
  getAnalyticsDashboard,
  getUserPerformance,
  getLearningPath,
} from '../../services/analyticsService';
import type {
  AnalyticsDashboard,
  UserPerformance,
  LearningPathItem,
} from '../../services/analyticsService';
import type { User } from '../../types/auth';
import type { SimulationSession } from '../../types/simulation';
import { showToast } from '../../lib/toast';
import DashboardAreaChart from '../../components/charts/DashboardAreaChart';
import type { ChartPoint } from '../../components/charts/AdminCharts';
import { PageLoader } from '../../components/ui/Loading';
import '../../assets/css/DashboardPage.css';
import '../../assets/css/DashboardCharts.css';

// ─── Local types ──────────────────────────────────────────────────────────────

interface RecentSimulation {
  sessionId: string;
  scenarioId: string;
  name: string;
  category: string;
  categoryDisplay: string;
  difficulty: string;
  difficultyDisplay: string;
  score: number | null;
  timeSpentMinutes: number;
  status: 'completed' | 'in-progress';
  date: string;
  color: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner:     '#10B981',
  intermediate: '#3B82F6',
  advanced:     '#8B5CF6',
  expert:       '#EF4444',
};

const CATEGORY_COLORS = [
  '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B',
  '#EF4444', '#06B6D4', '#EC4899', '#84CC16',
];

function getDifficultyClass(difficulty: string) {
  switch (difficulty) {
    case 'beginner':     return 'easy';
    case 'intermediate': return 'medium';
    case 'advanced':     return 'hard';
    case 'expert':       return 'expert';
    default:             return 'easy';
  }
}

/** Map recommended_difficulty → certification label */
function difficultyToLevel(difficulty: string): string {
  const map: Record<string, string> = {
    beginner:     'Beginner',
    intermediate: 'Intermediate',
    advanced:     'Advanced',
    expert:       'Expert',
  };
  return map[difficulty] ?? 'Beginner';
}

function levelToProgress(level: string): number {
  const map: Record<string, number> = {
    Beginner:     25,
    Intermediate: 50,
    Advanced:     75,
    Expert:       100,
  };
  return map[level] ?? 25;
}

function formatCategoryLabel(category: string): string {
  return category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function buildCategoryAreaData(
  sessions: SimulationSession[],
  category: string,
): ChartPoint[] {
  const filtered = sessions
    .filter(
      s =>
        s.status === 'completed' &&
        s.scenario.category === category &&
        s.score != null,
    )
    .sort(
      (a, b) =>
        new Date(a.completed_at ?? a.last_activity).getTime() -
        new Date(b.completed_at ?? b.last_activity).getTime(),
    );

  if (filtered.length === 0) return [];

  const points: ChartPoint[] = filtered.map((s, i) => {
    const d = new Date(s.completed_at ?? s.last_activity);
    const name =
      filtered.length <= 3
        ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : `Run ${i + 1}`;
    return { name, value: Math.round(s.score ?? 0) };
  });

  if (points.length === 1) {
    return [{ name: 'Start', value: 0 }, points[0]];
  }
  return points;
}

function formatMinutes(seconds: number): string {
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

function toRecentSimulation(session: SimulationSession): RecentSimulation {
  const status: 'completed' | 'in-progress' =
    session.status === 'completed' ? 'completed' : 'in-progress';
  return {
    sessionId:        session.id,
    scenarioId:       session.scenario.id,
    name:             session.scenario.title,
    category:         session.scenario.category,
    categoryDisplay:  session.scenario.category_display ?? session.scenario.category,
    difficulty:       session.scenario.difficulty,
    difficultyDisplay: session.scenario.difficulty_display ?? session.scenario.difficulty,
    score:            session.score ?? null,
    timeSpentMinutes: Math.floor((session.time_spent ?? 0) / 60),
    status,
    date:             session.completed_at
      ? new Date(session.completed_at).toLocaleDateString()
      : 'In Progress',
    color: DIFFICULTY_COLORS[session.scenario.difficulty] ?? '#8B5CF6',
  };
}

// ─── DashboardPage ─────────────────────────────────────────────────────────────

const DashboardPage: React.FC = () => {
  const [loading, setLoading] = useState(true);

  const [user, setUser]                           = useState<User | null>(null);
  const [analyticsDash, setAnalyticsDash]         = useState<AnalyticsDashboard | null>(null);
  const [performance, setPerformance]             = useState<UserPerformance | null>(null);
  const [recentSims, setRecentSims]               = useState<RecentSimulation[]>([]);
  const [allSessions, setAllSessions]             = useState<SimulationSession[]>([]);
  const [learningPath, setLearningPath]           = useState<LearningPathItem[]>([]);
  const [pendingCount, setPendingCount]           = useState(0);

  // ── Data fetch ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        // Run all requests in parallel; each is individually guarded
        const [profileResult, dashResult, perfResult, sessionsResult, pathResult] =
          await Promise.allSettled([
            getProfile(),
            getAnalyticsDashboard(),
            getUserPerformance(),
            getAllSessions(),
            getLearningPath(),
          ]);

        if (profileResult.status === 'fulfilled') {
          setUser(profileResult.value);
        }

        if (dashResult.status === 'fulfilled') {
          setAnalyticsDash(dashResult.value);
        }

        if (perfResult.status === 'fulfilled') {
          setPerformance(perfResult.value);
        }

        if (pathResult.status === 'fulfilled') {
          setLearningPath(pathResult.value.slice(0, 4));
        }

        if (sessionsResult.status === 'fulfilled') {
          const sessions = sessionsResult.value;
          setAllSessions(sessions);
          const pending = sessions.filter(s => s.status === 'in_progress').length;
          setPendingCount(pending);

          const recent = [...sessions]
            .sort(
              (a, b) =>
                new Date(b.last_activity).getTime() -
                new Date(a.last_activity).getTime(),
            )
            .slice(0, 5)
            .map(toRecentSimulation);

          setRecentSims(recent);
        }
      } catch {
        showToast({ type: 'error', message: 'Failed to load some dashboard data.' });
      } finally {
        setLoading(false);
      }
    };

    void fetchAll();
  }, []);

  // ── Derived values ──────────────────────────────────────────────────────────
  const avgScore       = analyticsDash?.average_score ?? 0;
  const completedSims  = analyticsDash?.completed_simulations ?? 0;
  const totalSims      = analyticsDash?.total_simulations ?? 0;
  const avgResponseTime = performance?.average_response_time ?? 0;
  const certLevel      = difficultyToLevel(performance?.recommended_difficulty ?? 'beginner');
  const weakAreas      = analyticsDash?.weak_areas ?? performance?.weak_areas ?? [];
  const strongAreas    = analyticsDash?.strong_areas ?? performance?.strong_areas ?? [];
  const categoryStats = analyticsDash?.category_stats ?? [];
  const topCategories = [...categoryStats]
    .sort((a, b) => b.count - a.count)
    .slice(0, 2);

  const statsCards = [
    {
      title:       'Overall Score',
      value:       `${Math.round(avgScore)}%`,
      change:      avgScore >= 70 ? `+${Math.round(avgScore - 70)}% above average` : `${Math.round(avgScore - 70)}% below average`,
      icon:        TrendingUp,
      color:       'blue',
      progress:    Math.round(avgScore),
      description: 'Average across all completed simulations',
    },
    {
      title:       'Simulations Completed',
      value:       `${completedSims}`,
      change:      totalSims > 0 ? `${totalSims} total sessions` : 'No sessions yet',
      icon:        Target,
      color:       'purple',
      progress:    totalSims > 0 ? Math.round((completedSims / totalSims) * 100) : 0,
      description: 'Training modules finished',
    },
    {
      title:       'Avg Response Time',
      value:       avgResponseTime > 0 ? `${avgResponseTime.toFixed(1)}s` : '—',
      change:      avgResponseTime > 0 && avgResponseTime < 3 ? 'Excellent speed' : avgResponseTime >= 3 ? 'Room to improve' : 'No data yet',
      icon:        Clock,
      color:       'green',
      progress:    avgResponseTime > 0 ? Math.min(100, Math.max(0, Math.round((3 - avgResponseTime) * 33))) : 0,
      description: 'Decision speed across all exercises',
    },
    {
      title:       'Certification Level',
      value:       certLevel,
      change:      certLevel !== 'Beginner' ? 'Level unlocked' : 'Getting started',
      icon:        Award,
      color:       'yellow',
      progress:    levelToProgress(certLevel),
      description: 'Current training tier',
    },
  ];

  const quickActions = [
    { title: 'Start Simulation', icon: PlayCircle, color: 'blue',   path: '/dashboard/simulations',       description: 'Begin new training scenario' },
    { title: 'View Analytics',   icon: BarChart3,  color: 'purple', path: '/dashboard/analytics',         description: 'Detailed performance reports' },
    { title: 'My Courses',       icon: Users,      color: 'green',  path: '/dashboard/learning-materials', description: 'Access learning materials' },
    { title: 'Lecture Schedule', icon: Calendar,   color: 'yellow', path: '/dashboard/lecture-schedule',  description: 'Join live sessions' },
  ];

  // Build performance insights from real data only
  const performanceInsights = [
    ...(avgScore >= 80
      ? [{
          title:       'Outstanding Performance',
          description: `Your average score of ${Math.round(avgScore)}% puts you in the top tier. Keep pushing!`,
          icon:        CheckCircle,
          type:        'positive',
          trend:       'Excellent',
        }]
      : avgScore >= 60
        ? [{
            title:       'Good Progress',
            description: `You're averaging ${Math.round(avgScore)}% across simulations. Focus on weak areas to break 80%.`,
            icon:        TrendingUp,
            type:        'info',
            trend:       'Progressing',
          }]
        : completedSims > 0
          ? [{
              title:       'Building Foundations',
              description: `Your current average is ${Math.round(avgScore)}%. Review training materials and retry scenarios.`,
              icon:        AlertTriangle,
              type:        'warning',
              trend:       'Needs Attention',
            }]
          : []),
    ...(weakAreas.length > 0
      ? [{
          title:       `Focus Area: ${weakAreas[0].replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`,
          description: `Performance in "${weakAreas[0].replace(/_/g, ' ')}" is below average. Consider the related training modules.`,
          icon:        AlertTriangle,
          type:        'warning',
          trend:       'Needs Attention',
        }]
      : []),
    ...(strongAreas.length > 0
      ? [{
          title:       `Strength: ${strongAreas[0].replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`,
          description: `You're consistently strong in "${strongAreas[0].replace(/_/g, ' ')}". Use this as a foundation.`,
          icon:        CheckCircle,
          type:        'positive',
          trend:       'Strength',
        }]
      : []),
    ...(completedSims === 0
      ? [{
          title:       'Start Your Journey',
          description: 'Complete your first simulation to unlock personalised performance insights.',
          icon:        PlayCircle,
          type:        'info',
          trend:       'Ready to Start',
        }]
      : []),
  ].slice(0, 3); // Show max 3 insights

  const handleResumeTraining = () => {
    const inProgress = recentSims.find(s => s.status === 'in-progress');
    window.location.href = inProgress
      ? `/dashboard/simulation/${inProgress.sessionId}`
      : '/dashboard/simulations';
  };

  // ── Render: loading ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="role-dashboard dashboard-page loading">
        <PageLoader message="Loading dashboard…" className="min-h-0 py-12" />
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="role-dashboard dashboard-page">
{/* ── Welcome ─────────────────────────────────────────────────────── */}
      <div className="welcome-header">
        <div className="welcome-content">
          <div className="welcome-greeting">
            <h1 className="welcome-title">
              Welcome back,{' '}
              <span className="gradient-text">
                {user?.full_name || user?.username || 'Trainee'}
              </span>
            </h1>
          </div>
          <p className="welcome-subtitle">
            Continue your cybersecurity training journey.{' '}
            {pendingCount > 0 ? (
              <>
                You have <strong>{pendingCount} simulation{pendingCount > 1 ? 's' : ''}</strong> in
                progress.
              </>
            ) : (
              'Start a new simulation to continue building your skills.'
            )}
          </p>
        </div>
        <div className="welcome-actions">
          <button className="resume-button" onClick={handleResumeTraining}>
            <PlayCircle size={20} />
            <span>{pendingCount > 0 ? 'Resume Training' : 'Start Training'}</span>
          </button>
        </div>
      </div>

      {/* ── Quick actions ────────────────────────────────────────────────── */}
      <div className="quick-actions">
        <div className="section-header">
          <h2 className="section-title">Quick Actions</h2>
        </div>
        <div className="actions-grid">
          {quickActions.map((action, index) => (
            <Link key={index} to={action.path} className="action-card card-3d">
              <div className={`action-icon ${action.color}`}>
                <action.icon size={24} />
              </div>
              <div className="action-content">
                <h3 className="action-title">{action.title}</h3>
                <p className="action-description">{action.description}</p>
              </div>
              <div className="action-arrow">→</div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Stats cards ──────────────────────────────────────────────────── */}
      <div className="stats-grid">
        {statsCards.map((stat, index) => (
          <div key={index} className="stat-card card-3d">
            <div className="stat-header">
              <div className={`stat-icon ${stat.color}`}>
                <stat.icon size={24} />
              </div>
              <div className="stat-change">
                <span className={`change-label`}>{stat.change}</span>
              </div>
            </div>
            <div className="stat-content">
              <h3 className="stat-value">{stat.value}</h3>
              <p className="stat-title">{stat.title}</p>
              <p className="stat-description">{stat.description}</p>
              <div className="stat-progress">
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{ width: `${stat.progress}%` }}
                  />
                </div>
                <span className="progress-label">{stat.progress}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Main content grid ────────────────────────────────────────────── */}
      <div className="dashboard-content-grid">

        {/* Recent simulations */}
        <div className="recent-simulations card-3d">
          <div className="section-header">
            <div>
              <h2 className="section-title">Recent Simulations</h2>
              <p className="section-subtitle">Your latest training activities</p>
            </div>
            <Link to="/dashboard/simulations" className="view-all">View All</Link>
          </div>

          <div className="simulations-list">
            {recentSims.length === 0 ? (
              <div className="empty-state">
                <PlayCircle size={32} />
                <p>No simulations yet.</p>
                <span>Start your first training scenario to see it here.</span>
              </div>
            ) : (
              recentSims.map(sim => (
                <div key={sim.sessionId} className="simulation-item">
                  <div className="simulation-info">
                    <div className="simulation-header">
                      <h3 className="simulation-name">{sim.name}</h3>
                      <span className={`difficulty-badge ${getDifficultyClass(sim.difficulty)}`}>
                        {sim.difficultyDisplay}
                      </span>
                    </div>
                    <div className="simulation-meta">
                      <span className="category">{sim.categoryDisplay}</span>
                      <span className="time">
                        <Clock size={14} />
                        {sim.timeSpentMinutes > 0 ? `${sim.timeSpentMinutes}m` : '< 1m'}
                      </span>
                      <span className="date">{sim.date}</span>
                    </div>
                  </div>

                  <div className="simulation-right">
                    {sim.score !== null ? (
                      <div className="score-display">
                        <div className="score-circle">
                          <svg
                            className="progress-ring"
                            width="72"
                            height="72"
                            viewBox="0 0 72 72"
                          >
                            <defs>
                              <linearGradient
                                id={`grad-${sim.sessionId}`}
                                x1="0%" y1="0%" x2="100%" y2="100%"
                              >
                                <stop offset="0%"   stopColor={sim.color} />
                                <stop offset="100%" stopColor={sim.color} stopOpacity="0.6" />
                              </linearGradient>
                            </defs>
                            <circle
                              strokeWidth="6" fill="transparent" r="30" cx="36" cy="36"
                              stroke="var(--bg-tertiary)"
                            />
                            <circle
                              strokeWidth="6" fill="transparent" r="30" cx="36" cy="36"
                              stroke={`url(#grad-${sim.sessionId})`}
                              strokeDasharray={`${2 * Math.PI * 30}`}
                              strokeDashoffset={`${2 * Math.PI * 30 * (1 - sim.score / 100)}`}
                              strokeLinecap="round"
                              style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
                            />
                          </svg>
                          <span className="score-value">
                            {sim.score}<small>%</small>
                          </span>
                        </div>
                      </div>
                    ) : (
                      <button
                        className="continue-button"
                        onClick={() =>
                          (window.location.href = `/dashboard/simulation/${sim.sessionId}`)
                        }
                      >
                        <PlayCircle size={22} />
                        <span>Continue</span>
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Category Performance — replaces the fake Threat Landscape */}
        <div className="threat-landscape card-3d">
          <div className="section-header p-5">
            <div>
              <h2 className="section-title">
                <Activity size={20} />
                Category Performance
              </h2>
              <p className="section-subtitle">Your results by simulation category</p>
            </div>
            {analyticsDash && (
              <div className="last-updated">
                <span className="weekly-stat">
                  <strong>{analyticsDash.weekly_simulations}</strong> this week
                </span>
              </div>
            )}
          </div>

          <div className="threats-list p-5">
            {topCategories.length === 0 ? (
              <div className="empty-state threats-empty">
                <BarChart3 size={32} />
                <p>No category data yet.</p>
                <span>
                  Complete simulations across different categories to see your performance breakdown here.
                </span>
              </div>
            ) : (
              <div
                className={`category-charts-grid ${topCategories.length === 1 ? 'single' : ''}`}
              >
                {topCategories.map((stat, index) => {
                  const color = CATEGORY_COLORS[index % CATEGORY_COLORS.length];
                  const label = formatCategoryLabel(stat.category);
                  return (
                    <DashboardAreaChart
                      key={stat.category}
                      gradientId={`cat-area-${stat.category}`}
                      title={label}
                      subtitle={`${stat.count} completed · avg ${Math.round(stat.avg_score)}%`}
                      data={buildCategoryAreaData(allSessions, stat.category)}
                      color={color}
                      height={210}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Total time summary */}
          {analyticsDash && analyticsDash.total_time > 0 && (
            <div className="time-summary">
              <Clock size={14} />
              <span>
                Total training time:{' '}
                <strong>{formatMinutes(analyticsDash.total_time)}</strong>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Recommended Learning Path ───────────────────────────────────── */}
      {learningPath.length > 0 && (
        <div className="learning-path-panel card-3d">
          <div className="section-header">
            <div>
              <h2 className="section-title">
                <Zap size={20} />
                Recommended for You
              </h2>
              <p className="section-subtitle">Personalised next steps based on your performance</p>
            </div>
            <Link to="/dashboard/simulations" className="view-all">Browse All</Link>
          </div>
          <div className="learning-path-grid">
            {learningPath.map((item, i) => (
              <Link
                key={item.scenario_id}
                to={`/dashboard/simulations?scenario=${item.scenario_id}`}
                className="lp-card"
              >
                <div className="lp-rank">#{i + 1}</div>
                <div className="lp-info">
                  <p className="lp-title">{item.title}</p>
                  <div className="lp-meta">
                    <span className={`difficulty-badge ${getDifficultyClass(item.difficulty)}`}>{item.difficulty}</span>
                    <span className="lp-time"><Clock size={12} /> {item.estimated_time}m</span>
                  </div>
                  <p className="lp-reason">{item.reason}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Performance insights ─────────────────────────────────────────── */}
      <div className="performance-insights card-3d">
        <div className="section-header">
          <div>
            <h2 className="section-title">
              <Brain size={20} />
              Performance Insights
            </h2>
            <p className="section-subtitle">Smart analysis of your training progress</p>
          </div>
          <div className="insights-badge">
            <Zap size={16} />
            Real-time Analytics
          </div>
        </div>

        <div className="insights-content">
          {performanceInsights.length === 0 ? (
            <div className="insight-card">
              <div className="insight-icon info">
                <Brain size={24} />
              </div>
              <div className="insight-text">
                <div className="insight-header">
                  <h3>Insights Loading</h3>
                  <span className="insight-trend info">Pending data</span>
                </div>
                <p>
                  Complete more simulations to unlock personalised performance insights and
                  AI-driven recommendations.
                </p>
              </div>
            </div>
          ) : (
            performanceInsights.map((insight, index) => (
              <div key={index} className="insight-card">
                <div className={`insight-icon ${insight.type}`}>
                  <insight.icon size={24} />
                </div>
                <div className="insight-text">
                  <div className="insight-header">
                    <h3>{insight.title}</h3>
                    <span className={`insight-trend ${insight.type}`}>{insight.trend}</span>
                  </div>
                  <p>{insight.description}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;