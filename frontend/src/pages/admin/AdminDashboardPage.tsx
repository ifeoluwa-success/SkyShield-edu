import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Shield,
  BarChart2,
  AlertTriangle,
  Upload,
  CheckCircle,
  Award,
  RefreshCw,
  Download,
  Activity,
  Calendar,
  FileText,
  GraduationCap,
  BookOpen,
} from 'lucide-react';
import api from '../../services/api';
import {
  getPlatformCertificationAnalytics,
  getPlatformOverview,
  getPlatformPerformanceTrends,
  getPlatformRetryAnalytics,
  getPlatformUserAnalytics,
} from '../../services/analyticsService';
import AnalyticsStatCard from '../../components/analytics/AnalyticsStatCard';
import TrendsTable from '../../components/analytics/TrendsTable';
import { AdminAreaChart, AdminBarChart, AdminPieChart } from '../../components/charts/AdminCharts';
import { useAdminChartMetricsQuery } from '../../hooks/useAdminPortal';
import { adminKeys, ADMIN_STALE_MS } from '../../lib/adminQueryKeys';
import { showToast } from '../../lib/toast';
import { PageLoader } from '../../components/ui/Loading';
import { downloadCsv } from '../../lib/apiUtils';
import '../../assets/css/RoleDashboard.css';
import '../../assets/css/AnalyticsComponents.css';
import '../../assets/css/AdminDashboardPage.css';
import '../../assets/css/AdminCharts.css';

interface LegacyAdminStats {
  users: { total: number; active: number; completion_rate: number };
  simulations: { total: number; completed: number; completion_rate: number };
  scenarios: number;
  activity: { errors_24h: number; uploads_24h: number };
}

const AdminDashboardPage: React.FC = () => {
  const qc = useQueryClient();
  const [periodDays, setPeriodDays] = useState(30);
  const [trendMonths, setTrendMonths] = useState(8);
  const [chartDays, setChartDays] = useState(30);
  const [chartPeriodMode, setChartPeriodMode] = useState<'preset' | 'custom'>('preset');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [appliedCustomRange, setAppliedCustomRange] = useState<{
    start_date: string;
    end_date: string;
  } | null>(null);

  const bundleQuery = useQuery({
    queryKey: adminKeys.dashboardBundle(periodDays, trendMonths, chartDays),
    queryFn: async () => {
      const [legacyRes, overview, users, certData, trendData, retryData] = await Promise.all([
        api.get<LegacyAdminStats>('/core/admin/stats/').catch(() => ({ data: null })),
        getPlatformOverview(),
        getPlatformUserAnalytics(periodDays),
        getPlatformCertificationAnalytics(),
        getPlatformPerformanceTrends(trendMonths),
        getPlatformRetryAnalytics(),
      ]);
      return {
        legacy: legacyRes.data,
        platform: overview,
        userAnalytics: users,
        certs: certData,
        trends: trendData.trends,
        retries: retryData,
      };
    },
    staleTime: ADMIN_STALE_MS,
  });

  const chartQuery = useAdminChartMetricsQuery(
    chartDays,
    trendMonths,
    chartPeriodMode === 'custom' ? appliedCustomRange : null,
  );

  const legacy = bundleQuery.data?.legacy ?? null;
  const platform = bundleQuery.data?.platform ?? null;
  const userAnalytics = bundleQuery.data?.userAnalytics ?? null;
  const certs = bundleQuery.data?.certs ?? null;
  const trends = bundleQuery.data?.trends ?? [];
  const retries = bundleQuery.data?.retries ?? null;
  const chartMetrics = chartQuery.data ?? null;

  const loading = bundleQuery.isLoading || chartQuery.isLoading;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: adminKeys.all });
  };

  const rolePieData = useMemo(
    () =>
      platform
        ? [
            { name: 'Trainees', value: platform.users.by_role.trainee },
            { name: 'Supervisors', value: platform.users.by_role.supervisor },
            { name: 'Instructors', value: platform.users.by_role.instructor },
            { name: 'Admins', value: platform.users.by_role.admin },
          ].filter(d => d.value > 0)
        : [],
    [platform],
  );

  const exportTrendsCsv = () => {
    if (!trends.length) return;
    downloadCsv('platform-performance-trends.csv', [
      ['Period', 'Avg Score', 'Active Learners', 'Completions', 'Avg Sessions/User'],
      ...trends.map(r => [
        r.period ?? '',
        String(Math.round(r.avg_score)),
        String(r.active_learners),
        String(r.completions),
        String(r.avg_sessions_per_user),
      ]),
    ]);
    showToast({ type: 'success', message: 'Trends exported' });
  };

  const onChartPeriodChange = (value: string) => {
    if (value === 'custom') {
      setChartPeriodMode('custom');
      return;
    }
    setChartPeriodMode('preset');
    setAppliedCustomRange(null);
    setChartDays(Number(value));
  };

  const applyCustomChartRange = () => {
    if (!customStart || !customEnd) {
      showToast({ type: 'error', message: 'Select both a start date and an end date' });
      return;
    }
    if (customStart > customEnd) {
      showToast({ type: 'error', message: 'Start date must be on or before end date' });
      return;
    }
    const start = new Date(`${customStart}T00:00:00Z`);
    const end = new Date(`${customEnd}T00:00:00Z`);
    const spanDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
    if (spanDays > 365) {
      showToast({ type: 'error', message: 'Date range cannot exceed 365 days' });
      return;
    }
    setChartPeriodMode('custom');
    setAppliedCustomRange({ start_date: customStart, end_date: customEnd });
  };

  const chartPeriodLabel =
    chartPeriodMode === 'custom' && appliedCustomRange
      ? `${appliedCustomRange.start_date} – ${appliedCustomRange.end_date}`
      : `Last ${chartDays} days`;

  if (loading) {
    return (
      <div className="role-dashboard loading">
        <PageLoader message="Loading platform analytics…" className="min-h-0 py-12" />
      </div>
    );
  }

  if (!platform) {
    return (
      <div className="role-dashboard error-state">
        <AlertTriangle size={40} />
        <p>Could not load admin dashboard.</p>
        <button type="button" className="btn-secondary" onClick={refresh}>
          Retry
        </button>
      </div>
    );
  }

  const users = platform.users;
  const sims = platform.simulations;
  const activeRate = users.total ? Math.round((users.active / users.total) * 100) : 0;
  const completionRate = sims.total_sessions
    ? Math.round((sims.completed / sims.total_sessions) * 100)
    : 0;

  return (
    <div className="role-dashboard admin-dashboard-page">
<nav className="quick-links">
        <Link to="/admin/users" className="quick-link">
          <Users size={14} /> All users
        </Link>
        <Link to="/admin/supervisors" className="quick-link">
          <Users size={14} /> Supervisors
        </Link>
        <Link to="/admin/instructors" className="quick-link">
          <GraduationCap size={14} /> Instructors
        </Link>
        <Link to="/admin/admins" className="quick-link">
          <Shield size={14} /> Admins
        </Link>
        <Link to="/admin/tutors" className="quick-link">
          <GraduationCap size={14} /> Tutors
        </Link>
        <Link to="/admin/courses-list" className="quick-link">
          <BookOpen size={14} /> Courses
        </Link>
        <Link to="/admin/schedule-all" className="quick-link">
          <Calendar size={14} /> Schedule
        </Link>
        <Link to="/admin/logs" className="quick-link">
          <FileText size={14} /> Logs
        </Link>
      </nav>

      <header className="page-header">
        <div className="header-content">
          <div>
            <h1 className="page-title">Metrics & Charts</h1>
            <p className="page-subtitle">
              Organization-wide metrics · {users.total.toLocaleString()} users · updated{' '}
              {new Date(platform.generated_at).toLocaleString()}
            </p>
          </div>
          <div className="header-actions">
            <select
              className="admin-filter-select"
              value={chartPeriodMode === 'custom' ? 'custom' : String(periodDays)}
              onChange={e => {
                const value = e.target.value;
                if (value === 'custom') {
                  setChartPeriodMode('custom');
                  return;
                }
                setPeriodDays(Number(value));
                setChartPeriodMode('preset');
                setAppliedCustomRange(null);
              }}
              aria-label="Metrics period"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value="custom">Custom</option>
            </select>
            {chartPeriodMode === 'custom' && (
              <div className="admin-custom-range">
                <label>
                  Start date
                  <input
                    type="date"
                    className="admin-filter-select"
                    value={customStart}
                    onChange={e => setCustomStart(e.target.value)}
                    aria-label="Custom start date"
                  />
                </label>
                <label>
                  End date
                  <input
                    type="date"
                    className="admin-filter-select"
                    value={customEnd}
                    onChange={e => setCustomEnd(e.target.value)}
                    aria-label="Custom end date"
                  />
                </label>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={applyCustomChartRange}
                  disabled={!customStart || !customEnd}
                >
                  Apply
                </button>
              </div>
            )}
            <button type="button" className="btn-secondary" onClick={exportTrendsCsv}>
              <Download size={16} /> Export
            </button>
            <button type="button" className="btn-secondary" onClick={refresh}>
              <RefreshCw size={16} /> Refresh
            </button>
          </div>
        </div>
      </header>

      <section className="dashboard-section">
        <h2 className="dashboard-section-title">
          <Users size={18} /> User base
        </h2>
        <div className="analytics-section-grid">
          <AnalyticsStatCard label="Total users" value={users.total} icon={<Users size={18} />} />
          <AnalyticsStatCard
            label="Active users"
            value={users.active}
            variant="success"
            barPercent={activeRate}
          />
          <AnalyticsStatCard label="New (7d)" value={users.new_last_7_days} />
          <AnalyticsStatCard label="New (30d)" value={users.new_last_30_days} />
          <AnalyticsStatCard label="Trainees" value={users.by_role.trainee} />
          <AnalyticsStatCard label="Supervisors" value={users.by_role.supervisor} />
          <AnalyticsStatCard label="Instructors" value={users.by_role.instructor} />
          <AnalyticsStatCard label="Admins" value={users.by_role.admin} />
        </div>
        <div className="admin-charts-grid">
          <AdminPieChart title="Users by role" data={rolePieData} />
          {userAnalytics && userAnalytics.registration_trend.length > 0 && (
            <AdminAreaChart
              title={`New registrations (${userAnalytics.period_days}d)`}
              data={userAnalytics.registration_trend.slice(-30).map(r => ({
                name: r.date.slice(5),
                value: r.count,
              }))}
            />
          )}
        </div>
      </section>

      <section className="dashboard-section">
        <h2 className="dashboard-section-title">
          <Shield size={18} /> Simulations & engagement
        </h2>
        <div className="analytics-section-grid">
          <AnalyticsStatCard label="Total sessions" value={sims.total_sessions} />
          <AnalyticsStatCard label="Completed" value={sims.completed} variant="success" />
          <AnalyticsStatCard label="Failed" value={sims.failed} variant="danger" />
          <AnalyticsStatCard label="Abandoned" value={sims.abandoned} variant="warning" />
          <AnalyticsStatCard
            label="Avg score"
            value={`${Math.round(sims.avg_score)}%`}
            barPercent={sims.avg_score}
          />
          <AnalyticsStatCard
            label="Completion rate"
            value={`${completionRate}%`}
            barPercent={completionRate}
          />
          <AnalyticsStatCard label="Active learners (30d)" value={sims.active_learners_30d} />
          <AnalyticsStatCard label="Scenarios (catalog)" value={legacy?.scenarios ?? '—'} />
        </div>
      </section>

      {retries && (
        <section className="dashboard-section">
          <h2 className="dashboard-section-title">
            <RefreshCw size={18} /> Retries & attempts
          </h2>
          <div className="analytics-section-grid">
            <AnalyticsStatCard label="Total sessions" value={retries.total_sessions} />
            <AnalyticsStatCard label="Scenarios with retries" value={retries.scenarios_with_retries} />
            <AnalyticsStatCard label="Failed sessions" value={retries.failed_sessions} variant="danger" />
            <AnalyticsStatCard label="Avg attempt #" value={retries.avg_attempt_number} />
          </div>
        </section>
      )}

      {certs && (
        <section className="dashboard-section">
          <h2 className="dashboard-section-title">
            <Award size={18} /> Certifications ({certs.total_issued.toLocaleString()} issued)
          </h2>
          <div className="admin-charts-grid">
            <AdminPieChart
              title="Certificates by level"
              data={certs.by_course_difficulty.map(row => ({
                name: row.level,
                value: row.count,
              }))}
            />
            {certs.issuance_trend.length > 0 && (
              <AdminAreaChart
                title="Certificate issuance trend"
                data={certs.issuance_trend.map(r => ({
                  name: r.period ?? '—',
                  value: r.count,
                }))}
              />
            )}
          </div>
          {certs.leaderboard.length > 0 && (
            <div className="analytics-panel" style={{ marginTop: '1rem' }}>
              <h3>Top earners</h3>
              <ol className="analytics-leaderboard">
                {certs.leaderboard.slice(0, 10).map((row, i) => (
                  <li key={row.email}>
                    <span>
                      <span className="rank">{i + 1}</span>
                      {row.email}
                    </span>
                    <strong>{row.certificates}</strong>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}

      <section className="dashboard-section">
        <div className="section-header-row">
          <h2 className="dashboard-section-title">
            <BarChart2 size={18} /> Performance trends
          </h2>
          <select
            className="admin-filter-select"
            value={trendMonths}
            onChange={e => setTrendMonths(Number(e.target.value))}
            aria-label="Trend months"
          >
            <option value={4}>4 months</option>
            <option value={6}>6 months</option>
            <option value={8}>8 months</option>
            <option value={12}>12 months</option>
          </select>
        </div>
        <TrendsTable rows={trends} showCompletions />
      </section>

      {chartMetrics && (
        <section className="dashboard-section">
          <div className="section-header-row">
            <div>
              <h2 className="dashboard-section-title">
                <BarChart2 size={18} /> Analytics charts
              </h2>
              <p className="admin-chart-range-label">Showing {chartPeriodLabel}</p>
            </div>
            <div className="admin-chart-period-controls">
              <select
                className="admin-filter-select"
                value={chartPeriodMode === 'custom' ? 'custom' : String(chartDays)}
                onChange={e => onChartPeriodChange(e.target.value)}
                aria-label="Chart period days"
              >
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
                <option value="custom">Custom</option>
              </select>
              {chartPeriodMode === 'custom' && (
                <div className="admin-custom-range">
                  <label>
                    Start date
                    <input
                      type="date"
                      className="admin-filter-select"
                      value={customStart}
                      onChange={e => setCustomStart(e.target.value)}
                      aria-label="Chart custom start date"
                    />
                  </label>
                  <label>
                    End date
                    <input
                      type="date"
                      className="admin-filter-select"
                      value={customEnd}
                      onChange={e => setCustomEnd(e.target.value)}
                      aria-label="Chart custom end date"
                    />
                  </label>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={applyCustomChartRange}
                    disabled={!customStart || !customEnd}
                  >
                    Apply
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="analytics-section-grid">
            <AnalyticsStatCard label="Courses" value={chartMetrics.summary.total_courses} />
            <AnalyticsStatCard
              label="Published courses"
              value={chartMetrics.summary.published_courses}
              variant="success"
            />
            <AnalyticsStatCard
              label="Certificates"
              value={chartMetrics.summary.certificates_issued}
            />
          </div>
          <div className="admin-charts-grid">
            <AdminAreaChart
              title="User growth"
              data={chartMetrics.charts.user_growth.map(r => ({
                name: r.date?.slice(5) ?? '—',
                value: r.count,
              }))}
            />
            <AdminAreaChart
              title="Login activity"
              data={chartMetrics.charts.login_activity.map(r => ({
                name: r.date?.slice(5) ?? '—',
                value: r.count,
              }))}
            />
            <AdminBarChart
              title="Simulation sessions by status"
              data={chartMetrics.charts.simulations_by_status.map(r => ({
                name: r.status,
                value: r.count,
              }))}
            />
            <AdminPieChart
              title="Users by account status"
              data={chartMetrics.charts.users_by_status.map(r => ({
                name: r.status,
                value: r.count,
              }))}
            />
            <AdminPieChart
              title="Courses published vs draft"
              data={chartMetrics.charts.courses_by_publish.map(r => ({
                name: r.label,
                value: r.count,
              }))}
            />
            <AdminPieChart
              title="Certificates by level"
              data={chartMetrics.charts.certificates_by_level.map(r => ({
                name: r.level,
                value: r.count,
              }))}
            />
            <AdminAreaChart
              title="Certificate issuance"
              data={chartMetrics.charts.certificate_issuance_trend.map(r => ({
                name: r.period ?? '—',
                value: r.count,
              }))}
            />
            <AdminBarChart
              title="Errors per day"
              color="#ef4444"
              data={chartMetrics.charts.errors_by_day.map(r => ({
                name: r.date?.slice(5) ?? '—',
                value: r.count,
              }))}
            />
            <AdminBarChart
              title="Top departments"
              data={chartMetrics.charts.users_by_department.slice(0, 8).map(r => ({
                name: (r.department || '—').slice(0, 12),
                value: r.count,
              }))}
            />
            <div className="full-width">
              <AdminBarChart
                title="Avg simulation score by month"
                color="#3b82f6"
                data={chartMetrics.charts.simulation_performance_trend.map(r => ({
                  name: r.period ?? '—',
                  value: Math.round(r.avg_score),
                }))}
              />
            </div>
            <div className="full-width">
              <AdminAreaChart
                title="Course enrollments by month"
                data={chartMetrics.charts.enrollments_trend.map(r => ({
                  name: r.period ?? '—',
                  value: r.count,
                }))}
              />
            </div>
          </div>
        </section>
      )}

      {legacy && (
        <section className="dashboard-section">
          <h2 className="dashboard-section-title">
            <Activity size={18} /> System activity (24h)
          </h2>
          <div className="analytics-section-grid">
            <AnalyticsStatCard
              label="Errors"
              value={legacy.activity.errors_24h}
              variant={legacy.activity.errors_24h > 0 ? 'danger' : 'success'}
              icon={
                legacy.activity.errors_24h > 0 ? (
                  <AlertTriangle size={18} />
                ) : (
                  <CheckCircle size={18} />
                )
              }
            />
            <AnalyticsStatCard
              label="File uploads"
              value={legacy.activity.uploads_24h}
              icon={<Upload size={18} />}
            />
          </div>
        </section>
      )}
    </div>
  );
};

export default AdminDashboardPage;
