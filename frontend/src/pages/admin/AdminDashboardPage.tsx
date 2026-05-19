// src/pages/admin/AdminDashboardPage.tsx
import React, { useState, useEffect } from 'react';
import { Users, Shield, BarChart2, AlertTriangle, Upload, CheckCircle } from 'lucide-react';
import api from '../../services/api';
import Toast from '../../components/Toast';
import { PageLoader } from '../../components/ui/Loading';
import '../../assets/css/AdminDashboardPage.css';

interface AdminStats {
  users: {
    total: number;
    active: number;
    completion_rate: number;
  };
  simulations: {
    total: number;
    completed: number;
    completion_rate: number;
  };
  scenarios: number;
  activity: {
    errors_24h: number;
    uploads_24h: number;
  };
}

const AdminDashboardPage: React.FC = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get<AdminStats>('/core/admin/stats/');
        setStats(res.data);
      } catch {
        setToast({ type: 'error', message: 'Failed to load admin stats. Ensure you have admin privileges.' });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="role-dashboard loading">
        <PageLoader message="Loading admin statistics…" className="min-h-0 py-12" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="role-dashboard error-state">
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        <AlertTriangle size={40} />
        <p>Could not load admin dashboard stats.</p>
      </div>
    );
  }

  return (
    <div className="role-dashboard">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="page-header">
        <div className="header-content">
          <div>
            <h1 className="page-title">Admin Dashboard</h1>
            <p className="page-subtitle">Platform-wide statistics and health overview</p>
          </div>
        </div>
      </div>

      <section className="dashboard-section">
        <h2 className="dashboard-section-title">
          <Users size={18} /> Users
        </h2>
        <div className="dashboard-stats-grid">
          <div className="dashboard-stat-card">
            <div className="dashboard-stat-value">{stats.users.total.toLocaleString()}</div>
            <div className="dashboard-stat-label">Total Users</div>
          </div>
          <div className="dashboard-stat-card">
            <div className="dashboard-stat-value">{stats.users.active.toLocaleString()}</div>
            <div className="dashboard-stat-label">Active Users</div>
          </div>
          <div className="dashboard-stat-card">
            <div className="dashboard-stat-value">{stats.users.completion_rate}%</div>
            <div className="dashboard-stat-label">Active Rate</div>
            <div className="dashboard-stat-bar-track">
              <div
                className="dashboard-stat-bar-fill"
                style={{ width: `${stats.users.completion_rate}%`, background: '#10b981' }}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard-section">
        <h2 className="dashboard-section-title">
          <Shield size={18} /> Simulations
        </h2>
        <div className="dashboard-stats-grid">
          <div className="dashboard-stat-card">
            <div className="dashboard-stat-value">{stats.simulations.total.toLocaleString()}</div>
            <div className="dashboard-stat-label">Total Sessions</div>
          </div>
          <div className="dashboard-stat-card">
            <div className="dashboard-stat-value">{stats.simulations.completed.toLocaleString()}</div>
            <div className="dashboard-stat-label">Completed</div>
          </div>
          <div className="dashboard-stat-card">
            <div className="dashboard-stat-value">{stats.simulations.completion_rate}%</div>
            <div className="dashboard-stat-label">Completion Rate</div>
            <div className="dashboard-stat-bar-track">
              <div
                className="dashboard-stat-bar-fill"
                style={{ width: `${stats.simulations.completion_rate}%`, background: '#8b5cf6' }}
              />
            </div>
          </div>
          <div className="dashboard-stat-card">
            <div className="dashboard-stat-value">{stats.scenarios}</div>
            <div className="dashboard-stat-label">Scenarios</div>
          </div>
        </div>
      </section>

      <section className="dashboard-section">
        <h2 className="dashboard-section-title">
          <BarChart2 size={18} /> Last 24 Hours
        </h2>
        <div className="dashboard-stats-grid">
          <div className={`dashboard-stat-card ${stats.activity.errors_24h > 0 ? 'alert' : ''}`}>
            <div className="dashboard-stat-header">
              {stats.activity.errors_24h > 0 ? (
                <AlertTriangle size={18} color="#ef4444" />
              ) : (
                <CheckCircle size={18} color="#10b981" />
              )}
            </div>
            <div className="dashboard-stat-value">{stats.activity.errors_24h}</div>
            <div className="dashboard-stat-label">Errors</div>
          </div>
          <div className="dashboard-stat-card">
            <div className="dashboard-stat-header">
              <Upload size={18} color="#3b82f6" />
            </div>
            <div className="dashboard-stat-value">{stats.activity.uploads_24h}</div>
            <div className="dashboard-stat-label">File Uploads</div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default AdminDashboardPage;
