import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Plus, Pencil, Trash2, ArrowLeft, BookOpen, Layers } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { showToast } from '../../lib/toast';
import { PageLoader, Spinner } from '../../components/ui/Loading';
import '../../assets/css/TutorCourseBuilderPage.css';
import type { Course, CourseModule } from '../../types/course';
import {
  createCourse,
  createModule,
  getCourse,
  getCourses,
  publishCourse,
  updateCourse,
  getScenarios,
  type ScenarioSummary,
} from '../../services/courseService';

type ViewMode = 'list' | 'builder';

type BuilderModule = {
  key: string;
  serverId?: string;
  position: number;
  title: string;
  description: string;
  module_type: 'reading' | 'simulation';
  content_body: string;
  scenario: string | null;
  minimum_passing_score: number;
  max_simulation_attempts: number;
};

const newKey = () => `mod_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const courseModuleToBuilder = (m: CourseModule): BuilderModule => ({
  key: m.id,
  serverId: m.id,
  position: m.position,
  title: m.title,
  description: m.description,
  module_type: m.module_type,
  content_body: m.content_body ?? '',
  scenario: m.scenario,
  minimum_passing_score: m.minimum_passing_score,
  max_simulation_attempts: m.max_simulation_attempts,
});

const TutorCourseBuilderPage: React.FC = () => {
  const { user, isTrainee } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = location.pathname.startsWith('/admin') ? '/admin' : '/tutor';

  const [view, setView] = useState<ViewMode>('list');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingBuilder, setLoadingBuilder] = useState(false);
  const [loadingScenarios, setLoadingScenarios] = useState(true);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);

  const [courseId, setCourseId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [threatFocus, setThreatFocus] = useState('');
  const [difficulty, setDifficulty] = useState<1 | 2 | 3 | 4>(2);
  const [estimatedHours, setEstimatedHours] = useState(1);
  const [passingThreshold, setPassingThreshold] = useState(70);
  const [savingCourse, setSavingCourse] = useState(false);
  const [modules, setModules] = useState<BuilderModule[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [savingModules, setSavingModules] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [draft, setDraft] = useState({
    title: '',
    description: '',
    module_type: 'reading' as 'reading' | 'simulation',
    content_body: '',
    scenario: '' as string,
    minimum_passing_score: 70,
    max_simulation_attempts: 3,
  });

  const canAccess = user?.role === 'supervisor' || user?.role === 'admin' || user?.role === 'instructor';
  const section2Enabled = Boolean(courseId);

  const myCourses = useMemo(
    () =>
      courses.filter(
        c => user?.username && c.created_by_username?.toLowerCase() === user.username.toLowerCase(),
      ),
    [courses, user?.username],
  );

  const loadCourses = useCallback(async () => {
    try {
      setLoadingList(true);
      const data = await getCourses();
      setCourses(data);
    } catch {
      showToast({ type: 'error', message: 'Failed to load courses' });
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadCourses();
  }, [loadCourses]);

  useEffect(() => {
    const loadScenarios = async () => {
      setLoadingScenarios(true);
      try {
        setScenarios(await getScenarios());
      } catch {
        setScenarios([]);
      } finally {
        setLoadingScenarios(false);
      }
    };
    void loadScenarios();
  }, []);

  const resetBuilder = () => {
    setCourseId(null);
    setTitle('');
    setDescription('');
    setThreatFocus('');
    setDifficulty(2);
    setEstimatedHours(1);
    setPassingThreshold(70);
    setModules([]);
    setEditingKey(null);
    setShowAddForm(false);
  };

  const openBuilderNew = () => {
    resetBuilder();
    setView('builder');
  };

  const openBuilderEdit = async (id: string) => {
    setLoadingBuilder(true);
    try {
      const c = await getCourse(id);
      setCourseId(c.id);
      setTitle(c.title);
      setDescription(c.description);
      setThreatFocus(c.threat_focus);
      setDifficulty(c.difficulty);
      setEstimatedHours(c.estimated_hours);
      setPassingThreshold(c.passing_threshold);
      setModules((c.modules ?? []).map(courseModuleToBuilder));
      setView('builder');
      setEditingKey(null);
      setShowAddForm(false);
    } catch {
      showToast({ type: 'error', message: 'Failed to load course' });
    } finally {
      setLoadingBuilder(false);
    }
  };

  const handleSaveCourseDetails = async () => {
    if (!title.trim() || !description.trim()) {
      showToast({ type: 'error', message: 'Title and description are required' });
      return;
    }
    try {
      setSavingCourse(true);
      const payload = {
        title: title.trim(),
        description: description.trim(),
        threat_focus: threatFocus.trim() || 'General',
        difficulty,
        estimated_hours: Math.max(0, estimatedHours),
        passing_threshold: Math.min(100, Math.max(0, passingThreshold)),
      };
      if (courseId) {
        const updated = await updateCourse(courseId, {
          ...payload,
          difficulty,
        });
        setCourseId(updated.id);
        showToast({ type: 'success', message: 'Course details saved' });
      } else {
        const created = await createCourse(payload);
        setCourseId(created.id);
        showToast({ type: 'success', message: 'Course created' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not save course' });
    } finally {
      setSavingCourse(false);
    }
  };

  const saveDraftToModules = () => {
    if (!draft.title.trim()) {
      showToast({ type: 'error', message: 'Module title is required' });
      return;
    }
    const pos =
      modules.length === 0 ? 0 : Math.max(...modules.map(m => m.position), -1) + 1;
    const row: BuilderModule = {
      key: newKey(),
      position: pos,
      title: draft.title.trim(),
      description: draft.description.trim(),
      module_type: draft.module_type,
      content_body: draft.module_type === 'reading' ? draft.content_body : '',
      scenario: draft.module_type === 'simulation' && draft.scenario ? draft.scenario : null,
      minimum_passing_score:
        draft.module_type === 'simulation' ? draft.minimum_passing_score : 0,
      max_simulation_attempts:
        draft.module_type === 'simulation' ? draft.max_simulation_attempts : 0,
    };
    setModules(prev => [...prev, row]);
    setShowAddForm(false);
    setDraft({
      title: '',
      description: '',
      module_type: 'reading',
      content_body: '',
      scenario: '',
      minimum_passing_score: 70,
      max_simulation_attempts: 3,
    });
    showToast({ type: 'success', message: 'Module added (local). Save all modules to sync.' });
  };

  const updateModuleField = (key: string, patch: Partial<BuilderModule>) => {
    setModules(prev => prev.map(m => (m.key === key ? { ...m, ...patch } : m)));
  };

  const removeModule = (key: string) => {
    setModules(prev => prev.filter(m => m.key !== key));
    if (editingKey === key) setEditingKey(null);
  };

  const buildModulesPayload = (list: BuilderModule[]): Partial<CourseModule>[] =>
    [...list]
      .sort((a, b) => a.position - b.position)
      .map(m => ({
        ...(m.serverId ? { id: m.serverId } : {}),
        title: m.title,
        description: m.description,
        module_type: m.module_type,
        position: m.position,
        content_body: m.module_type === 'reading' ? m.content_body : '',
        scenario: m.module_type === 'simulation' ? m.scenario : null,
        minimum_passing_score:
          m.module_type === 'simulation' ? m.minimum_passing_score : 0,
        max_simulation_attempts:
          m.module_type === 'simulation' ? m.max_simulation_attempts : 0,
      })) as Partial<CourseModule>[];

  const handleSaveAllModules = async () => {
    if (!courseId) {
      showToast({ type: 'error', message: 'Save course details first' });
      return;
    }
    const sorted = [...modules].sort((a, b) => a.position - b.position);
    try {
      setSavingModules(true);
      try {
        await updateCourse(courseId, {
          modules: buildModulesPayload(sorted) as unknown as Course['modules'],
        });
      } catch {
        for (const m of sorted) {
          if (!m.serverId) {
            await createModule(courseId, {
              title: m.title,
              description: m.description,
              module_type: m.module_type,
              position: m.position,
              content_body: m.module_type === 'reading' ? m.content_body : undefined,
              scenario: m.module_type === 'simulation' && m.scenario ? m.scenario : undefined,
              minimum_passing_score:
                m.module_type === 'simulation' ? m.minimum_passing_score : undefined,
              max_simulation_attempts:
                m.module_type === 'simulation' ? m.max_simulation_attempts : undefined,
            });
          }
        }
      }
      const fresh = await getCourse(courseId);
      setModules((fresh.modules ?? []).map(courseModuleToBuilder));
      showToast({ type: 'success', message: 'Modules saved' });
    } catch {
      showToast({ type: 'error', message: 'Could not save modules' });
    } finally {
      setSavingModules(false);
    }
  };

  const handlePublishCourse = async () => {
    if (!courseId) return;
    try {
      setPublishing(true);
      await publishCourse(courseId);
      showToast({ type: 'success', message: 'Course is now live' });
      resetBuilder();
      setView('list');
      void loadCourses();
    } catch {
      showToast({ type: 'error', message: 'Publish failed' });
    } finally {
      setPublishing(false);
    }
  };

  const handlePublishFromList = async (id: string) => {
    setPublishingId(id);
    try {
      await publishCourse(id);
      showToast({ type: 'success', message: 'Course published' });
      void loadCourses();
    } catch {
      showToast({ type: 'error', message: 'Publish failed' });
    } finally {
      setPublishingId(null);
    }
  };

  if (isTrainee || !canAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  if (view === 'list') {
    return (
      <div className="role-dashboard course-builder-page">
<header className="page-header">
          <div className="header-content">
            <h1 className="page-title">Course Builder</h1>
            <p className="page-subtitle">Create and manage training courses for your trainees</p>
          </div>
          <button type="button" onClick={openBuilderNew} className="btn-primary">
            <Plus size={18} />
            Create new course
          </button>
        </header>

        {loadingList ? (
          <PageLoader message="Loading your courses…" className="min-h-0 py-16" />
        ) : myCourses.length === 0 ? (
          <div className="empty-state-box">
            <BookOpen size={40} className="empty-state-icon" />
            <p>No courses yet. Create your first course to get started.</p>
            <button type="button" onClick={openBuilderNew} className="btn-primary empty-state-cta">
              <Plus size={18} />
              Create new course
            </button>
          </div>
        ) : (
          <div className="courses-panel">
            <div className="courses-table-wrap">
              <table className="courses-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Threat focus</th>
                    <th>Difficulty</th>
                    <th>Modules</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {myCourses.map((c) => (
                    <tr key={c.id}>
                      <td className="course-title-cell">{c.title}</td>
                      <td>{c.threat_focus || '—'}</td>
                      <td>
                        {['—', 'Beginner', 'Intermediate', 'Advanced', 'Expert'][c.difficulty] ??
                          c.difficulty}
                      </td>
                      <td>{c.module_count}</td>
                      <td>
                        <span
                          className={`status-badge ${c.is_published ? 'published' : 'draft'}`}
                        >
                          {c.is_published ? 'Published' : 'Draft'}
                        </span>
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            type="button"
                            onClick={() => void openBuilderEdit(c.id)}
                            className="text-link"
                          >
                            Edit
                          </button>
                          {!c.is_published && (
                            <button
                              type="button"
                              onClick={() => void handlePublishFromList(c.id)}
                              className="text-link"
                              disabled={publishingId === c.id}
                            >
                              {publishingId === c.id ? (
                                <>
                                  <Spinner size="sm" /> Publishing…
                                </>
                              ) : (
                                'Publish'
                              )}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => navigate(`${basePath}/courses/${c.id}/enrollments`)}
                            className="text-link muted"
                          >
                            Enrollments
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (loadingBuilder) {
    return (
      <div className="role-dashboard course-builder-page">
        <PageLoader message="Loading course…" className="min-h-0 py-16" />
      </div>
    );
  }

  return (
    <div className="role-dashboard course-builder-page">
<button
        type="button"
        onClick={() => {
          resetBuilder();
          setView('list');
          void loadCourses();
        }}
        className="back-link"
      >
        <ArrowLeft size={16} />
        Back to list
      </button>

      <header className="page-header">
        <div className="header-content">
          <h1 className="page-title">{courseId ? 'Edit course' : 'New course'}</h1>
          <p className="page-subtitle">Configure course details and learning modules</p>
        </div>
      </header>

      <div className="builder-stack">
        <section className="profile-card builder-section">
          <div className="card-header">
            <h2>
              <BookOpen size={20} />
              Course details
            </h2>
          </div>
          <div className="card-body">
            <div className="form-grid">
              <div className="form-group full-width">
                <label htmlFor="course-title">Title *</label>
                <input
                  id="course-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>
              <div className="form-group full-width">
                <label htmlFor="course-description">Description *</label>
                <textarea
                  id="course-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="course-threat">Threat focus</label>
                <input
                  id="course-threat"
                  value={threatFocus}
                  onChange={(e) => setThreatFocus(e.target.value)}
                  placeholder="e.g. GPS Spoofing"
                />
              </div>
              <div className="form-group">
                <label htmlFor="course-difficulty">Difficulty</label>
                <select
                  id="course-difficulty"
                  value={difficulty}
                  onChange={(e) => setDifficulty(Number(e.target.value) as 1 | 2 | 3 | 4)}
                >
                  <option value={1}>Beginner</option>
                  <option value={2}>Intermediate</option>
                  <option value={3}>Advanced</option>
                  <option value={4}>Expert</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="course-hours">Estimated hours</label>
                <input
                  id="course-hours"
                  type="number"
                  min={0}
                  step={0.5}
                  value={estimatedHours}
                  onChange={(e) => setEstimatedHours(Number(e.target.value))}
                />
              </div>
              <div className="form-group">
                <label htmlFor="course-threshold">Passing threshold %</label>
                <input
                  id="course-threshold"
                  type="number"
                  min={0}
                  max={100}
                  value={passingThreshold}
                  onChange={(e) => setPassingThreshold(Number(e.target.value))}
                />
              </div>
            </div>
          </div>
          <div className="card-footer">
            <button
              type="button"
              disabled={savingCourse}
              onClick={() => void handleSaveCourseDetails()}
              className="btn-primary"
            >
              {savingCourse ? (
                <>
                  <Spinner size="sm" /> Saving…
                </>
              ) : (
                'Save course details'
              )}
            </button>
          </div>
        </section>

        <section
          className={`profile-card builder-section ${section2Enabled ? '' : 'disabled'}`}
        >
          <div className="card-header">
            <h2>
              <Layers size={20} />
              Course modules
            </h2>
            <button
              type="button"
              disabled={!section2Enabled}
              onClick={() => setShowAddForm(true)}
              className="btn-secondary"
            >
              <Plus size={16} />
              Add module
            </button>
          </div>
          <div className="card-body">
            {!section2Enabled && (
              <p className="section-hint">Save course details first to add modules.</p>
            )}

            {loadingScenarios && (
              <p className="section-hint" role="status">
                <Spinner size="sm" /> Loading scenarios…
              </p>
            )}

            <ul className="module-list">
              {[...modules]
                .sort((a, b) => a.position - b.position)
                .map((m) => (
                  <li key={m.key} className="module-item">
                    <div className="module-item-header">
                      <div className="module-item-meta">
                        <label className="module-position">
                          Pos
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={m.position}
                            onChange={(e) =>
                              updateModuleField(m.key, {
                                position: Math.max(0, Math.floor(Number(e.target.value)) || 0),
                              })
                            }
                          />
                        </label>
                        <span className="module-title-text">{m.title}</span>
                        <span className="module-type-badge">
                          {m.module_type === 'reading' ? 'Reading' : 'Simulation'}
                        </span>
                      </div>
                      <div className="module-actions">
                        <button
                          type="button"
                          onClick={() => setEditingKey(editingKey === m.key ? null : m.key)}
                          className="icon-btn"
                          aria-label="Edit module"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeModule(m.key)}
                          className="icon-btn danger"
                          aria-label="Remove module"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    {editingKey === m.key && (
                      <div className="module-edit-fields">
                        <div className="form-group">
                          <input
                            value={m.title}
                            onChange={(e) => updateModuleField(m.key, { title: e.target.value })}
                            placeholder="Title"
                          />
                        </div>
                        <div className="form-group">
                          <textarea
                            value={m.description}
                            onChange={(e) =>
                              updateModuleField(m.key, { description: e.target.value })
                            }
                            rows={2}
                            placeholder="Description"
                          />
                        </div>
                        {m.module_type === 'reading' ? (
                          <div className="form-group">
                            <textarea
                              value={m.content_body}
                              onChange={(e) =>
                                updateModuleField(m.key, { content_body: e.target.value })
                              }
                              rows={6}
                              placeholder="Content body"
                            />
                          </div>
                        ) : (
                          <>
                            <div className="form-group">
                              <select
                                value={m.scenario ?? ''}
                                onChange={(e) =>
                                  updateModuleField(m.key, {
                                    scenario: e.target.value || null,
                                  })
                                }
                              >
                                <option value="">Select scenario</option>
                                {scenarios.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.title} — {s.threat_type} (diff {s.difficulty})
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="module-edit-row">
                              <label>
                                Min pass %
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={m.minimum_passing_score}
                                  onChange={(e) =>
                                    updateModuleField(m.key, {
                                      minimum_passing_score: Number(e.target.value),
                                    })
                                  }
                                />
                              </label>
                              <label>
                                Max attempts
                                <input
                                  type="number"
                                  min={1}
                                  value={m.max_simulation_attempts}
                                  onChange={(e) =>
                                    updateModuleField(m.key, {
                                      max_simulation_attempts: Number(e.target.value),
                                    })
                                  }
                                />
                              </label>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                ))}
            </ul>

            {showAddForm && section2Enabled && (
              <div className="module-add-panel">
                <h3>New module</h3>
                <div className="form-group">
                  <input
                    value={draft.title}
                    onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                    placeholder="Module title"
                  />
                </div>
                <div className="radio-group">
                  <label>
                    <input
                      type="radio"
                      checked={draft.module_type === 'reading'}
                      onChange={() => setDraft((d) => ({ ...d, module_type: 'reading' }))}
                    />
                    Reading
                  </label>
                  <label>
                    <input
                      type="radio"
                      checked={draft.module_type === 'simulation'}
                      onChange={() => setDraft((d) => ({ ...d, module_type: 'simulation' }))}
                    />
                    Simulation checkpoint
                  </label>
                </div>
                {draft.module_type === 'reading' ? (
                  <div className="form-group">
                    <textarea
                      value={draft.content_body}
                      onChange={(e) => setDraft((d) => ({ ...d, content_body: e.target.value }))}
                      rows={6}
                      placeholder="Content body"
                    />
                  </div>
                ) : (
                  <>
                    <div className="form-group">
                      <select
                        value={draft.scenario}
                        onChange={(e) => setDraft((d) => ({ ...d, scenario: e.target.value }))}
                      >
                        <option value="">Select scenario</option>
                        {scenarios.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title} — {s.threat_type} (diff {s.difficulty})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="module-edit-row">
                      <label>
                        Min pass %
                        <input
                          type="number"
                          value={draft.minimum_passing_score}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              minimum_passing_score: Number(e.target.value),
                            }))
                          }
                        />
                      </label>
                      <label>
                        Max attempts
                        <input
                          type="number"
                          value={draft.max_simulation_attempts}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              max_simulation_attempts: Number(e.target.value),
                            }))
                          }
                        />
                      </label>
                    </div>
                  </>
                )}
                <div className="panel-actions">
                  <button type="button" onClick={saveDraftToModules} className="btn-primary">
                    Save module
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="builder-footer-actions">
              <button
                type="button"
                disabled={!section2Enabled || savingModules}
                onClick={() => void handleSaveAllModules()}
                className="btn-secondary"
              >
                {savingModules ? (
                  <>
                    <Spinner size="sm" /> Saving…
                  </>
                ) : (
                  'Save all modules'
                )}
              </button>
              <button
                type="button"
                disabled={!section2Enabled || publishing}
                onClick={() => void handlePublishCourse()}
                className="btn-primary"
              >
                {publishing ? (
                  <>
                    <Spinner size="sm" /> Publishing…
                  </>
                ) : (
                  'Publish course'
                )}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default TutorCourseBuilderPage;
