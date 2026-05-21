// src/pages/tutor/TutorDashboardPage.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { getTutorDashboardStats, getUpcomingMeetings } from '../../services/tutorService';
import type { TutorDashboardStats, Meeting } from '../../types/tutor';
import {
  Upload, Video, BookOpen, Calendar, Users, FileText, Clock,
  ExternalLink, BarChart3, Eye
} from 'lucide-react';
import Toast from '../../components/Toast';
import { PageLoader } from '../../components/ui/Loading';
import '../../assets/css/TutorDashboardPage.css';
import { usePortalBasePath } from '../../hooks/usePortalBasePath';

const TutorDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const basePath = usePortalBasePath();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<TutorDashboardStats | null>(null);
  const [upcomingMeetings, setUpcomingMeetings] = useState<Meeting[]>([]);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const userName = user?.full_name || user?.email?.split('@')[0] || 'Tutor';

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const [statsData, meetingsData] = await Promise.allSettled([
          getTutorDashboardStats(),
          getUpcomingMeetings(),
        ]);
        if (statsData.status === 'fulfilled') setStats(statsData.value);
        else setToast({ type: 'error', message: 'Failed to load dashboard data' });
        if (meetingsData.status === 'fulfilled') setUpcomingMeetings(meetingsData.value.slice(0, 3));
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <div className="role-dashboard tutor-dashboard-page loading">
        <PageLoader message="Loading dashboard…" className="min-h-0 py-12" />
      </div>
    );
  }

  const statCards = [
    { title: 'Total Students', value: stats?.total_students ?? 0, change: `+${stats?.total_students ?? 0} total`, icon: Users, color: 'blue', trend: 'up' },
    { title: 'Materials Uploaded', value: stats?.total_materials ?? 0, change: `${stats?.total_materials ?? 0} total`, icon: Upload, color: 'purple', trend: 'stable' },
    { title: 'Exercises Created', value: stats?.total_exercises ?? 0, change: `${stats?.total_exercises ?? 0} total`, icon: FileText, color: 'green', trend: 'stable' },
    { title: 'Upcoming Sessions', value: stats?.upcoming_sessions ?? 0, change: `Next: ${stats?.upcoming_sessions_list[0]?.start_time ? new Date(stats.upcoming_sessions_list[0].start_time).toLocaleDateString() : 'None'}`, icon: Calendar, color: 'yellow', trend: 'warning' },
  ];

  const quickActions = [
    { title: 'Upload New Video', icon: Video, color: 'blue', path: `${basePath}/materials`, description: 'Click to get started' },
    { title: 'Create Exercise', icon: FileText, color: 'purple', path: `${basePath}/exercises`, description: 'Click to get started' },
    { title: 'Schedule Session', icon: Calendar, color: 'green', path: `${basePath}/schedule`, description: 'Click to get started' },
    { title: 'View Analytics', icon: BarChart3, color: 'yellow', path: `${basePath}/analytics`, description: 'Click to get started' },
  ];

  const recentUploads = stats?.recent_uploads.map(upload => ({
    id: upload.id,
    name: upload.title,
    type: upload.material_type.charAt(0).toUpperCase() + upload.material_type.slice(1),
    size: upload.file_url ? 'File' : 'Link',
    date: new Date(upload.created_at).toLocaleDateString(),
    views: 0,
    status: upload.is_published ? 'published' : 'draft',
  })) || [];

  const sessionItems = (stats?.upcoming_sessions_list ?? []).map(s => ({
    id: s.id,
    title: s.title,
    dateRaw: new Date(s.start_time),
    date: new Date(s.start_time).toLocaleString(),
    platform: s.platform.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
    students: s.current_attendees,
    link: s.meeting_link || '#',
    kind: 'session' as const,
  }));

  const meetingItems = upcomingMeetings.map(m => ({
    id: m.id,
    title: m.title,
    dateRaw: new Date(m.scheduled_start ?? m.created_at),
    date: new Date(m.scheduled_start ?? m.created_at).toLocaleString(),
    platform: 'Internal Meeting',
    students: m.participant_count ?? 0,
    link: m.meeting_code ? `/meetings/join/${m.meeting_code}` : '#',
    kind: 'meeting' as const,
  }));

  const upcomingSessions = [...sessionItems, ...meetingItems]
    .sort((a, b) => a.dateRaw.getTime() - b.dateRaw.getTime())
    .slice(0, 5);

  const studentPerformance = stats?.student_performance.map(student => ({
    name: student.student_name,
    progress: (student.completed_materials + student.completed_exercises) * 10,
    completed: student.completed_materials + student.completed_exercises,
    avgScore: student.average_score,
    status: student.average_score > 80 ? 'excellent' : student.average_score > 60 ? 'good' : student.average_score > 40 ? 'needs-attention' : 'critical',
    studentId: student.student_id,
  })) || [];

  const handleUploadClick = () => {
    navigate(`${basePath}/materials?upload=true`);
  };

  const handleScheduleClick = () => {
    navigate(`${basePath}/schedule`);
  };

  const handleViewStudent = (studentId: string) => {
    navigate(`${basePath}/students/${studentId}`);
  };

  return (
    <div className="role-dashboard tutor-dashboard-page">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="welcome-header">
        <div className="welcome-content">
          <h1 className="welcome-title">
            Welcome, <span className="gradient-text">{userName}</span>
          </h1>
          <p className="welcome-subtitle">
            Manage your teaching materials, track student progress, and schedule training sessions.
          </p>
        </div>
        <div className="welcome-actions">
          <button className="primary-button" onClick={handleUploadClick}>
            <Upload size={20} />
            <span>Upload New Material</span>
          </button>
          <button className="secondary-button" onClick={handleScheduleClick}>
            <Calendar size={20} />
            <span>Schedule Session</span>
          </button>
        </div>
      </div>

      <div className="quick-actions-section">
        <h2 className="section-title">Quick Actions</h2>
        <div className="actions-grid">
          {quickActions.map((action, index) => (
            <button key={index} onClick={() => navigate(action.path)} className="action-card">
              <div className={`action-icon ${action.color}`}>
                <action.icon size={24} />
              </div>
              <div className="action-content">
                <h3>{action.title}</h3>
                <p>{action.description}</p>
              </div>
              <div className="action-arrow">→</div>
            </button>
          ))}
        </div>
      </div>

      <div className="stats-grid">
        {statCards.map((stat, index) => (
          <div key={index} className="stat-card">
            <div className="stat-header">
              <div className={`stat-icon ${stat.color}`}>
                <stat.icon size={24} />
              </div>
              <div className={`stat-change trend-${stat.trend}`}>
                {stat.change}
              </div>
            </div>
            <div className="stat-content">
              <h3 className="stat-value">{stat.value}</h3>
              <p className="stat-title">{stat.title}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-content-grid">
        <div className="content-card">
          <div className="card-header">
            <h3>Recent Uploads</h3>
            <button className="view-all" onClick={() => navigate(`${basePath}/materials`)}>View All</button>
          </div>
          <div className="uploads-list">
            {recentUploads.length === 0 ? (
              <div className="empty-state">No materials uploaded yet</div>
            ) : (
              recentUploads.map((upload) => (
                <div key={upload.id} className="upload-item">
                  <div className="upload-icon">
                    {upload.type === 'Video' ? <Video size={20} /> :
                     upload.type === 'E-Book' ? <BookOpen size={20} /> :
                     <FileText size={20} />}
                  </div>
                  <div className="upload-info">
                    <h4>{upload.name}</h4>
                    <div className="upload-meta">
                      <span className="type">{upload.type}</span>
                      <span className="size">{upload.size}</span>
                      <span className="date">{upload.date}</span>
                      <span className="views">
                        <Eye size={14} /> {upload.views} views
                      </span>
                    </div>
                  </div>
                  <div className="upload-actions">
                    <span className={`status-badge ${upload.status}`}>
                      {upload.status}
                    </span>
                    <button className="icon-button">
                      <ExternalLink size={18} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="content-card">
          <div className="card-header">
            <h3>Upcoming Sessions</h3>
            <button className="view-all" onClick={() => navigate('/tutor/schedule')}>View All</button>
          </div>
          <div className="sessions-list">
            {upcomingSessions.length === 0 ? (
              <div className="empty-state">No upcoming sessions</div>
            ) : (
              upcomingSessions.map((session) => (
                <div key={session.id} className="session-item">
                  <div className="session-info">
                    <h4>
                      {session.title}
                      <span className={`session-kind-badge ${session.kind}`}>{session.kind}</span>
                    </h4>
                    <div className="session-meta">
                      <Clock size={14} />
                      <span>{session.date}</span>
                      <span className="platform">{session.platform}</span>
                      <Users size={14} />
                      <span>{session.students} attendees</span>
                    </div>
                  </div>
                  <div className="session-actions">
                    <a
                      href={session.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="join-button"
                    >
                      Join Session
                    </a>
                    <button className="icon-button">
                      <ExternalLink size={18} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="content-card full-width">
        <div className="card-header">
          <h3>Student Performance</h3>
          <button className="view-all" onClick={() => navigate('/tutor/students')}>View All Students</button>
        </div>
        <div className="performance-table">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Progress</th>
                <th>Completed</th>
                <th>Avg Score</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {studentPerformance.length === 0 ? (
                <tr><td colSpan={6} className="empty-state">No student data available</td></tr>
              ) : (
                studentPerformance.map((student) => (
                  <tr key={student.studentId}>
                    <td className="student-name">
                      <div className="avatar">{student.name.charAt(0)}</div>
                      <span>{student.name}</span>
                    </td>
                    <td>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${student.progress}%` }} />
                        <span>{student.progress}%</span>
                      </div>
                    </td>
                    <td>{student.completed} items</td>
                    <td>
                      <div className={`score ${student.avgScore > 80 ? 'high' : student.avgScore > 60 ? 'medium' : 'low'}`}>
                        {student.avgScore}%
                      </div>
                    </td>
                    <td>
                      <span className={`status ${student.status}`}>
                        {student.status === 'excellent' ? 'Excellent' :
                         student.status === 'good' ? 'Good' :
                         student.status === 'needs-attention' ? 'Needs Attention' : 'Critical'}
                      </span>
                    </td>
                    <td>
                      <button className="action-button" onClick={() => handleViewStudent(student.studentId)}>
                        View Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TutorDashboardPage;