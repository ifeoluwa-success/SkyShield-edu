import React, { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  Copy,
  Users,
  Archive,
  Search,
  BarChart2,
  Pencil,
} from 'lucide-react';
import Toast from '../../components/Toast';
import { PageLoader } from '../../components/ui/Loading';
import { useAuth } from '../../hooks/useAuth';
import { getStudents } from '../../services/tutorService';
import type { StudentProgress } from '../../types/tutor';
import {
  assignScenario,
  createStaffScenario,
  deleteStaffScenario,
  duplicateStaffScenario,
  getScenarioPerformance,
  listStaffScenarios,
  updateStaffScenario,
  type ScenarioPublishStatus,
  type StaffScenario,
} from '../../services/scenarioStaffService';
import '../../assets/css/RoleDashboard.css';
import '../../assets/css/TutorScenarios.css';

const STATUS_OPTIONS: ScenarioPublishStatus[] = ['draft', 'active', 'archived'];

const emptyForm = {
  title: '',
  description: '',
  category: 'cyber',
  threat_type: 'general',
  difficulty: 'beginner',
  estimated_time: 30,
  max_attempts: 3,
  publish_status: 'draft' as ScenarioPublishStatus,
};

const TutorScenariosPage: React.FC = () => {
  const { user } = useAuth();
  const canWrite = user?.role === 'supervisor' || user?.role === 'admin';
  const [loading, setLoading] = useState(true);
  const [scenarios, setScenarios] = useState<StaffScenario[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<StaffScenario | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [assignTarget, setAssignTarget] = useState<StaffScenario | null>(null);
  const [students, setStudents] = useState<StudentProgress[]>([]);
  const [selectedTrainees, setSelectedTrainees] = useState<string[]>([]);
  const [assignMaxAttempts, setAssignMaxAttempts] = useState<number | ''>('');
  const [performance, setPerformance] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listStaffScenarios({
        publish_status: statusFilter ? (statusFilter as ScenarioPublishStatus) : undefined,
        search: search || undefined,
      });
      setScenarios(data);
    } catch {
      setToast({ type: 'error', message: 'Failed to load scenarios' });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (s: StaffScenario) => {
    setEditing(s);
    setForm({
      title: s.title,
      description: '',
      category: s.category,
      threat_type: s.threat_type,
      difficulty: s.difficulty,
      estimated_time: s.estimated_time,
      max_attempts: s.max_attempts,
      publish_status: s.publish_status,
    });
    setShowForm(true);
  };

  const saveScenario = async () => {
    if (!form.title.trim()) {
      setToast({ type: 'error', message: 'Title is required' });
      return;
    }
    try {
      if (editing) {
        await updateStaffScenario(editing.id, form);
        setToast({ type: 'success', message: 'Scenario updated' });
      } else {
        await createStaffScenario({
          ...form,
          description: form.description || form.title,
          steps: [{ id: 'step-1', title: 'Introduction', content: 'Review scenario briefing.' }],
        });
        setToast({ type: 'success', message: 'Scenario created as draft' });
      }
      setShowForm(false);
      load();
    } catch {
      setToast({ type: 'error', message: 'Could not save scenario' });
    }
  };

  const handleDuplicate = async (s: StaffScenario) => {
    try {
      await duplicateStaffScenario(s.id);
      setToast({ type: 'success', message: 'Scenario duplicated' });
      load();
    } catch {
      setToast({ type: 'error', message: 'Duplicate failed' });
    }
  };

  const handleArchive = async (s: StaffScenario) => {
    try {
      await deleteStaffScenario(s.id);
      setToast({ type: 'success', message: 'Scenario archived or removed' });
      load();
    } catch {
      setToast({ type: 'error', message: 'Archive failed' });
    }
  };

  const openAssign = async (s: StaffScenario) => {
    setAssignTarget(s);
    setSelectedTrainees([]);
    setAssignMaxAttempts(s.max_attempts);
    try {
      const list = await getStudents();
      setStudents(list);
    } catch {
      setToast({ type: 'error', message: 'Could not load trainees' });
    }
  };

  const submitAssign = async () => {
    if (!assignTarget || selectedTrainees.length === 0) {
      setToast({ type: 'error', message: 'Select at least one trainee' });
      return;
    }
    try {
      await assignScenario(assignTarget.id, {
        trainee_ids: selectedTrainees,
        max_attempts: assignMaxAttempts === '' ? undefined : Number(assignMaxAttempts),
      });
      setToast({ type: 'success', message: 'Scenario assigned' });
      setAssignTarget(null);
      load();
    } catch {
      setToast({ type: 'error', message: 'Assignment failed' });
    }
  };

  const showPerformance = async (s: StaffScenario) => {
    try {
      const perf = await getScenarioPerformance(s.id);
      const avg = perf.sessions.avg_score != null ? `${Math.round(perf.sessions.avg_score)}%` : '—';
      setPerformance(prev => ({
        ...prev,
        [s.id]: `${perf.sessions.completed}/${perf.sessions.total} completed · avg ${avg} · ${perf.active_assignments} active assignments`,
      }));
    } catch {
      setToast({ type: 'error', message: 'Could not load performance' });
    }
  };

  if (loading && scenarios.length === 0) {
    return (
      <div className="role-dashboard tutor-scenarios-page loading">
        <PageLoader message="Loading scenarios…" className="min-h-0 py-12" />
      </div>
    );
  }

  return (
    <div className="role-dashboard tutor-scenarios-page">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="page-header">
        <div className="header-content">
          <div>
            <h1 className="page-title">Training Scenarios</h1>
            <p className="page-subtitle">
              Create, publish, assign, and track simulation scenarios for your trainees
            </p>
          </div>
          {canWrite && (
            <button type="button" className="primary-button" onClick={openCreate}>
              <Plus size={16} />
              New Scenario
            </button>
          )}
        </div>
      </div>

      <div className="scenarios-toolbar">
        <div className="search-box">
          <Search size={18} />
          <input
            type="search"
            placeholder="Search scenarios…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()}
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button type="button" className="secondary-button" onClick={() => load()}>
          Refresh
        </button>
      </div>

      <div className="scenarios-table-wrap">
        <table className="scenarios-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th>Difficulty</th>
              <th>Attempts</th>
              <th>Assignments</th>
              <th>Completed</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-cell">No scenarios found.</td>
              </tr>
            ) : (
              scenarios.map(s => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.title}</strong>
                    <span className="meta">{s.category} · {s.threat_type}</span>
                    {performance[s.id] && <span className="perf-hint">{performance[s.id]}</span>}
                  </td>
                  <td><span className={`status-pill status-${s.publish_status}`}>{s.publish_status}</span></td>
                  <td>{s.difficulty}</td>
                  <td>{s.max_attempts}</td>
                  <td>{s.assignment_count ?? 0}</td>
                  <td>{s.times_completed}</td>
                  <td className="actions-cell">
                    <button type="button" title="Performance" onClick={() => showPerformance(s)}>
                      <BarChart2 size={16} />
                    </button>
                    {canWrite && (
                      <>
                        <button type="button" title="Edit" onClick={() => openEdit(s)}>
                          <Pencil size={16} />
                        </button>
                        <button type="button" title="Duplicate" onClick={() => handleDuplicate(s)}>
                          <Copy size={16} />
                        </button>
                        <button type="button" title="Assign" onClick={() => openAssign(s)}>
                          <Users size={16} />
                        </button>
                        <button type="button" title="Archive" onClick={() => handleArchive(s)}>
                          <Archive size={16} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showForm && canWrite && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h2>{editing ? 'Edit Scenario' : 'New Scenario'}</h2>
            <label>
              Title
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
            </label>
            <label>
              Description
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
              />
            </label>
            <div className="form-row">
              <label>
                Category
                <input
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                />
              </label>
              <label>
                Threat type
                <input
                  value={form.threat_type}
                  onChange={e => setForm(f => ({ ...f, threat_type: e.target.value }))}
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                Difficulty
                <select
                  value={form.difficulty}
                  onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))}
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                  <option value="expert">Expert</option>
                </select>
              </label>
              <label>
                Max attempts
                <input
                  type="number"
                  min={1}
                  value={form.max_attempts}
                  onChange={e => setForm(f => ({ ...f, max_attempts: Number(e.target.value) }))}
                />
              </label>
              <label>
                Status
                <select
                  value={form.publish_status}
                  onChange={e =>
                    setForm(f => ({ ...f, publish_status: e.target.value as ScenarioPublishStatus }))
                  }
                >
                  {STATUS_OPTIONS.map(st => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button type="button" className="primary-button" onClick={saveScenario}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {assignTarget && canWrite && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h2>Assign: {assignTarget.title}</h2>
            <label>
              Max attempts (override)
              <input
                type="number"
                min={1}
                value={assignMaxAttempts}
                onChange={e =>
                  setAssignMaxAttempts(e.target.value === '' ? '' : Number(e.target.value))
                }
              />
            </label>
            <p className="assign-hint">Select trainees</p>
            <div className="trainee-checklist">
              {students.map(st => (
                <label key={st.student_id} className="check-row">
                  <input
                    type="checkbox"
                    checked={selectedTrainees.includes(st.student_id)}
                    onChange={e => {
                      if (e.target.checked) {
                        setSelectedTrainees(ids => [...ids, st.student_id]);
                      } else {
                        setSelectedTrainees(ids => ids.filter(id => id !== st.student_id));
                      }
                    }}
                  />
                  <span>{st.student_name || st.student_email}</span>
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setAssignTarget(null)}>
                Cancel
              </button>
              <button type="button" className="primary-button" onClick={submitAssign}>
                Assign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TutorScenariosPage;
