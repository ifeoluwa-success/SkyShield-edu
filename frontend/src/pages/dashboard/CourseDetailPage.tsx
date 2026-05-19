import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AxiosError } from 'axios';
import {
  Lock,
  CheckCircle,
  XCircle,
  Circle,
  BookOpen,
  Target,
  ArrowLeft,
  Book,
  AlertTriangle,
  Trophy,
  Play,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import type { CourseEnrollment, CourseModule, ModuleProgress } from '../../types/course';
import {
  enrollInCourse,
  getMyProgress,
  markReadingComplete,
} from '../../services/courseService';
import { startSimulation } from '../../services/simulationService';
import { startMissionRun } from '../../services/incidentService';
import Toast from '../../components/Toast';
import { Spinner } from '../../components/ui/Loading';
import { useAuth } from '../../hooks/useAuth';
import '../../assets/css/CourseDetailPage.css';

/* ─── helpers (unchanged logic) ─────────────────────────────────────────── */

const isNotEnrolledResponse = (
  data: CourseEnrollment | { enrolled: false },
): data is { enrolled: false } =>
  typeof data === 'object' && data !== null && 'enrolled' in data && data.enrolled === false;

const sortedModules = (enrollment: CourseEnrollment): CourseModule[] =>
  [...(enrollment.course.modules ?? [])].sort((a, b) => a.position - b.position);

const progressForModule = (
  enrollment: CourseEnrollment,
  moduleId: string,
): ModuleProgress | undefined =>
  enrollment.module_progresses.find(p => p.module.id === moduleId);

const firstUnlockedModuleId = (enrollment: CourseEnrollment): string | null => {
  const mods = sortedModules(enrollment);
  for (const m of mods) {
    const p = progressForModule(enrollment, m.id);
    const status = p?.status ?? 'locked';
    if (status !== 'locked') return m.id;
  }
  return mods[0]?.id ?? null;
};

/* ─── inline styles ──────────────────────────────────────────────────────── */

const S: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    background: 'var(--bg-primary)',
    fontFamily: '"DM Sans", system-ui, sans-serif',
    color: 'var(--text-primary)',
  },
  topbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 28px',
    borderBottom: '1px solid var(--border-color)',
    background: 'var(--bg-secondary)',
  },
  backBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--text-secondary)',
    background: 'none',
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    padding: '6px 12px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  topbarSep: { color: 'var(--text-muted)', fontSize: 13 },
  topbarTitle: { fontSize: 13, color: 'var(--text-muted)', fontWeight: 400 },
  layout: {
    display: 'grid',
    gridTemplateColumns: '284px 1fr',
    flex: 1,
  },
  sidebar: {
    background: 'var(--bg-secondary)',
    borderRight: '1px solid var(--border-color)',
    padding: '28px 18px',
    position: 'sticky' as const,
    top: 0,
    height: 'calc(100vh - 53px)',
    overflowY: 'auto' as const,
  },
  main: {
    padding: '36px 40px',
    maxWidth: 820,
  },
  courseLabel: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    color: 'var(--text-muted)',
    marginBottom: 8,
  },
  courseTitle: {
    fontSize: 18,
    fontWeight: 600,
    lineHeight: 1.35,
    color: 'var(--text-primary)',
    marginBottom: 20,
  },
  progressMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 12,
    color: 'var(--text-secondary)',
    fontWeight: 500,
    marginBottom: 7,
  },
  progressTrack: {
    height: 4,
    background: 'var(--bg-elevated)',
    borderRadius: 99,
    overflow: 'hidden',
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    color: 'var(--text-muted)',
    marginBottom: 8,
    paddingLeft: 4,
  },
  moduleList: { listStyle: 'none', display: 'flex', flexDirection: 'column' as const, gap: 2 },
  card: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 20,
    boxShadow: 'var(--shadow-sm)',
  },
  cardHeader: {
    padding: '26px 30px 20px',
    borderBottom: '1px solid var(--border-color)',
  },
  cardBody: { padding: '26px 30px' },
  tagReading: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    padding: '4px 10px',
    borderRadius: 4,
    background: 'var(--violet-dim)',
    color: 'var(--violet)',
    marginBottom: 14,
  },
  tagSim: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    padding: '4px 10px',
    borderRadius: 4,
    background: 'var(--cyan-dim)',
    color: 'var(--cyan)',
    marginBottom: 14,
  },
  moduleHeading: {
    fontSize: 24,
    fontWeight: 600,
    lineHeight: 1.25,
    color: 'var(--text-primary)',
    marginBottom: 8,
  },
  moduleDesc: { fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 },
  readingBody: {
    fontSize: 15,
    lineHeight: 1.8,
    color: 'var(--text-primary)',
    borderLeft: '3px solid var(--border-color)',
    paddingLeft: 20,
    marginBottom: 28,
  },
  msgSuccess: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '13px 16px',
    borderRadius: 8,
    background: 'var(--success-dim)',
    color: 'var(--success)',
    fontSize: 14,
    marginBottom: 20,
    border: '1px solid color-mix(in srgb, var(--success) 35%, transparent)',
  },
  msgWarn: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '13px 16px',
    borderRadius: 8,
    background: 'var(--warning-dim)',
    color: 'var(--warning)',
    fontSize: 14,
    marginBottom: 20,
    border: '1px solid color-mix(in srgb, var(--warning) 35%, transparent)',
  },
  msgDanger: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '13px 16px',
    borderRadius: 8,
    background: 'var(--danger-dim)',
    color: 'var(--danger)',
    fontSize: 14,
    marginBottom: 20,
    border: '1px solid color-mix(in srgb, var(--danger) 35%, transparent)',
  },
  metaGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 12,
    marginBottom: 28,
  },
  metaCard: {
    background: 'var(--bg-tertiary)',
    borderRadius: 10,
    padding: '14px 16px',
    border: '1px solid var(--border-color)',
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.07em',
    marginBottom: 4,
  },
  metaValue: {
    fontSize: 22,
    fontWeight: 600,
    color: 'var(--text-primary)',
    fontVariantNumeric: 'tabular-nums' as const,
  },
  simDivider: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: 'var(--text-muted)',
    marginBottom: 22,
  },
  actionsRow: { display: 'flex', gap: 10, alignItems: 'center' },
  btnPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    background: 'linear-gradient(135deg, var(--cyan), var(--cyan-dark))',
    color: '#020c1b',
    border: 'none',
    borderRadius: 8,
    padding: '11px 22px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  btnSecondary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    background: 'var(--bg-tertiary)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    padding: '11px 20px',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  btnDisabled: { opacity: 0.45, cursor: 'default' },
  certBanner: {
    background: 'var(--gradient-primary)',
    borderRadius: 12,
    padding: '20px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    color: '#020c1b',
    marginTop: 20,
    border: '1px solid color-mix(in srgb, var(--cyan) 40%, transparent)',
  },
  certLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  certNum: { fontSize: 13, opacity: 0.75, marginTop: 2 },
  certHeading: { fontSize: 16, fontWeight: 600 },
  certBtn: {
    background: 'color-mix(in srgb, var(--bg-secondary) 25%, transparent)',
    border: '1px solid color-mix(in srgb, #020c1b 25%, transparent)',
    color: '#020c1b',
    borderRadius: 8,
    padding: '9px 18px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  stateWrap: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    padding: '60px 24px',
    textAlign: 'center' as const,
    gap: 12,
  },
  stateTitle: { fontSize: 22, fontWeight: 600, color: 'var(--text-primary)' },
  stateText: { fontSize: 15, color: 'var(--text-secondary)', maxWidth: 420, lineHeight: 1.65 },
  loadingWrap: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    gap: 14,
    background: 'var(--bg-primary)',
    color: 'var(--text-secondary)',
    fontSize: 15,
    fontFamily: '"DM Sans", system-ui, sans-serif',
  },
};

/* ─── sub-components ─────────────────────────────────────────────────────── */

const ModuleStatusIcon: React.FC<{ mod: CourseModule; enrollment: CourseEnrollment }> = ({
  mod,
  enrollment,
}) => {
  const p = progressForModule(enrollment, mod.id);
  const status = p?.status ?? 'locked';

  if (status === 'locked') return <Lock size={15} className="cd-icon-muted" />;
  if (status === 'passed') return <CheckCircle size={15} className="cd-icon-success" />;
  if (status === 'failed') {
    const canRetry = p && p.attempts < mod.max_simulation_attempts && mod.module_type === 'simulation';
    return (
      <span className="cd-status-fail">
        <XCircle size={15} />
        {canRetry && <span style={{ fontSize: 11, fontWeight: 600 }}>Retry</span>}
      </span>
    );
  }
  return <Circle size={15} className="cd-icon-progress" />;
};

interface MetaCardProps { label: string; value: string; valueColor?: string }
const MetaCard: React.FC<MetaCardProps> = ({ label, value, valueColor }) => (
  <div style={S.metaCard}>
    <p style={S.metaLabel}>{label}</p>
    <p style={{ ...S.metaValue, ...(valueColor ? { color: valueColor } : {}) }}>{value}</p>
  </div>
);

/* ─── main component ─────────────────────────────────────────────────────── */

const CourseDetailPage: React.FC = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const operatorRole = useMemo(() => {
    const role = (user as unknown as { role?: string } | null)?.role ?? '';
    const r = role.toLowerCase();
    if (r === 'support_operator' || r === 'operations_officer') return 'support_operator' as const;
    return 'lead_operator' as const;
  }, [user]);

  const [enrollment, setEnrollment] = useState<CourseEnrollment | null>(null);
  const [showEnrollPrompt, setShowEnrollPrompt] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [completingModuleId, setCompletingModuleId] = useState<string | null>(null);
  const [launchingSim, setLaunchingSim] = useState(false);
  const [launchingMission, setLaunchingMission] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [courseNotFound, setCourseNotFound] = useState(false);

  const refreshProgress = useCallback(async () => {
    if (!courseId) return;
    try {
      const data = await getMyProgress(courseId);
      setCourseNotFound(false);
      if (isNotEnrolledResponse(data)) {
        setEnrollment(null);
        setShowEnrollPrompt(true);
        return;
      }
      setShowEnrollPrompt(false);
      setEnrollment(data);
    } catch (err) {
      const status = (err as AxiosError)?.response?.status;
      if (status === 404) {
        setCourseNotFound(true);
        setEnrollment(null);
        setShowEnrollPrompt(false);
        return;
      }
      throw err;
    }
  }, [courseId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!courseId) return;
      try {
        setLoading(true);
        setCourseNotFound(false);
        const data = await getMyProgress(courseId);
        if (cancelled) return;
        if (isNotEnrolledResponse(data)) {
          setEnrollment(null);
          setShowEnrollPrompt(true);
        } else {
          setEnrollment(data);
          setShowEnrollPrompt(false);
          const first = firstUnlockedModuleId(data);
          setActiveModuleId(prev => prev ?? first);
        }
      } catch (err) {
        if (cancelled) return;
        const status = (err as AxiosError)?.response?.status;
        if (status === 404) {
          setCourseNotFound(true);
          setEnrollment(null);
          setShowEnrollPrompt(false);
        } else {
          setToast({ type: 'error', message: 'Failed to load course progress' });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [courseId]);

  useEffect(() => {
    if (!enrollment || activeModuleId) return;
    const first = firstUnlockedModuleId(enrollment);
    if (first) setActiveModuleId(first);
  }, [enrollment, activeModuleId]);

  const modulesOrdered = useMemo(
    () => (enrollment ? sortedModules(enrollment) : []),
    [enrollment],
  );

  const activeModule = useMemo(
    () => modulesOrdered.find(m => m.id === activeModuleId) ?? null,
    [modulesOrdered, activeModuleId],
  );

  const activeProgress = useMemo(
    () => (enrollment && activeModuleId ? progressForModule(enrollment, activeModuleId) : undefined),
    [enrollment, activeModuleId],
  );

  const effectiveStatus = activeProgress?.status ?? 'locked';

  const passedModuleCount = useMemo(
    () => enrollment?.module_progresses.filter(p => p.status === 'passed').length ?? 0,
    [enrollment],
  );

  const totalModuleCount = modulesOrdered.length;
  const progressPct = totalModuleCount > 0 ? Math.round((passedModuleCount / totalModuleCount) * 100) : 0;

  const handleMarkReadingComplete = async () => {
    if (!courseId || !activeModule) return;
    try {
      setCompletingModuleId(activeModule.id);
      await markReadingComplete(courseId, activeModule.id);
      await refreshProgress();
      setToast({ type: 'success', message: 'Reading marked complete' });
    } catch {
      setToast({ type: 'error', message: 'Could not mark module complete' });
    } finally {
      setCompletingModuleId(null);
    }
  };

  const handleLaunchSimulation = async () => {
    if (!activeModule?.scenario) {
      setToast({ type: 'error', message: 'No scenario linked to this module' });
      return;
    }
    if (!courseId) return;
    try {
      setLaunchingSim(true);
      const session = await startSimulation(activeModule.scenario);
      navigate(`/dashboard/simulation/${session.id}`, {
        state: { returnTo: `/dashboard/courses/${courseId}` },
      });
    } catch {
      setToast({ type: 'error', message: 'Could not start simulation' });
    } finally {
      setLaunchingSim(false);
    }
  };

  const handleLaunchImmersiveMission = async () => {
    if (!activeModule?.scenario) {
      setToast({ type: 'error', message: 'No scenario linked to this module' });
      return;
    }
    if (!courseId) return;
    try {
      setLaunchingMission(true);
      const result = await startMissionRun({
        scenario_id: activeModule.scenario,
        operator_role: operatorRole,
      });
      navigate(`/dashboard/mission/${result.run_id}`, {
        state: { returnTo: `/dashboard/courses/${courseId}` },
      });
    } catch {
      setToast({ type: 'error', message: 'Could not start immersive mission' });
    } finally {
      setLaunchingMission(false);
    }
  };

  const handleEnrollFromPrompt = async () => {
    if (!courseId) return;
    try {
      setEnrolling(true);
      await enrollInCourse(courseId);
      await refreshProgress();
      setToast({ type: 'success', message: 'You are enrolled' });
    } catch (err) {
      const status = (err as AxiosError)?.response?.status;
      if (status === 404) {
        setCourseNotFound(true);
        setShowEnrollPrompt(false);
      } else {
        setToast({ type: 'error', message: 'Enrollment failed' });
      }
    } finally {
      setEnrolling(false);
    }
  };

  /* ── state screens ─────────────────────────────────────────────────────── */

  if (!courseId) {
    return (
      <div style={S.page}>
        <div style={S.stateWrap}>
          <h1 style={S.stateTitle}>Invalid course</h1>
          <p style={S.stateText}>Missing course identifier in the URL.</p>
          <button style={S.btnPrimary} onClick={() => navigate('/dashboard/courses')}>
            Course library
          </button>
        </div>
      </div>
    );
  }

  if (courseNotFound) {
    return (
      <div style={S.page}>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        <div style={S.stateWrap}>
          <h1 style={S.stateTitle}>Course not found</h1>
          <p style={S.stateText}>
            This link may be outdated. Open the course from the library so the URL uses the course
            ID from the server.
          </p>
          <button style={S.btnPrimary} onClick={() => navigate('/dashboard/courses')}>
            Back to course library
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={S.loadingWrap}>
        <Spinner size="md" />
        <span>Loading course…</span>
      </div>
    );
  }

  if (showEnrollPrompt && !enrollment) {
    return (
      <div style={S.page}>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        <div style={S.stateWrap}>
          <BookOpen size={40} className="cd-icon-success" />
          <h1 style={S.stateTitle}>Enroll to access this course</h1>
          <p style={S.stateText}>
            Join the course to view modules, readings, and simulation checkpoints.
          </p>
          <button
            style={{ ...S.btnPrimary, ...(enrolling ? S.btnDisabled : {}) }}
            disabled={enrolling}
            onClick={() => void handleEnrollFromPrompt()}
          >
            {enrolling ? 'Enrolling…' : 'Enroll now'}
          </button>
        </div>
      </div>
    );
  }

  if (!enrollment) return null;

  const certIssued = enrollment.status === 'certificate_issued';

  /* ── main layout ───────────────────────────────────────────────────────── */

  return (
    <div style={S.page}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* top bar */}
      <div style={S.topbar}>
        <button style={S.backBtn} onClick={() => navigate('/dashboard/courses')}>
          <ArrowLeft size={14} />
          Course library
        </button>
        <span style={S.topbarSep}>/</span>
        <span style={S.topbarTitle}>{enrollment.course.title}</span>
      </div>

      {/* two-column layout */}
      <div style={S.layout}>

        {/* ── sidebar ──────────────────────────────────────────────────── */}
        <aside style={S.sidebar}>
          <p style={S.courseLabel}>Current course</p>
          <h1 style={S.courseTitle}>{enrollment.course.title}</h1>

          <div style={S.progressMeta}>
            <span>Progress</span>
            <span>{passedModuleCount} / {totalModuleCount} modules</span>
          </div>
          <div style={S.progressTrack}>
            <div className="cd-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>

          <p style={S.sectionLabel}>Modules</p>
          <ul style={S.moduleList}>
            {modulesOrdered.map(mod => {
              const p = progressForModule(enrollment, mod.id);
              const status = p?.status ?? 'locked';
              const locked = status === 'locked';
              const isActive = mod.id === activeModuleId;

              return (
                <li key={mod.id}>
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => !locked && setActiveModuleId(mod.id)}
                    className={`cd-sidebar-module${isActive ? ' cd-sidebar-module--active' : ''}${locked ? ' cd-sidebar-module--locked' : ''}`}
                  >
                    <span className="cd-sidebar-module-pos">{mod.position}</span>
                    <span className="cd-sidebar-module-body">
                      <span className="cd-sidebar-module-title">{mod.title}</span>
                      <span className="cd-sidebar-module-type">
                        {mod.module_type === 'reading'
                          ? <><Book size={11} /> Reading</>
                          : <><Target size={11} /> Simulation</>
                        }
                      </span>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center' }}>
                      <ModuleStatusIcon mod={mod} enrollment={enrollment} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* ── main content ─────────────────────────────────────────────── */}
        <main style={S.main}>

          {/* no active module — welcome state */}
          {!activeModule && (
            <div style={S.card}>
              <div style={S.cardHeader}>
                <h2 style={S.moduleHeading}>{enrollment.course.title}</h2>
                <p style={S.moduleDesc}>{enrollment.course.description}</p>
              </div>
              <div style={S.cardBody}>
                <p className="cd-welcome-hint">
                  Select a module from the list or start from the beginning.
                </p>
                <div style={S.actionsRow}>
                  <button
                    type="button"
                    style={S.btnPrimary}
                    onClick={() => {
                      const id = firstUnlockedModuleId(enrollment);
                      if (id) setActiveModuleId(id);
                    }}
                  >
                    <Play size={15} />
                    Start course
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* reading module */}
          {activeModule && activeModule.module_type === 'reading' && (
            <div style={S.card}>
              <div style={S.cardHeader}>
                <div style={S.tagReading}>
                  <Book size={11} />
                  Reading
                </div>
                <h2 style={S.moduleHeading}>{activeModule.title}</h2>
                <p style={S.moduleDesc}>{activeModule.description}</p>
              </div>

              <div style={S.cardBody}>
                <div style={S.readingBody}>{activeModule.content_body}</div>

                {!activeProgress && (
                  <div style={S.msgWarn}>
                    <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>Progress for this module is still syncing. Refresh if this persists.</span>
                  </div>
                )}

                {activeProgress && effectiveStatus === 'passed' && (
                  <div style={S.msgSuccess}>
                    <CheckCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>Module completed.</span>
                  </div>
                )}

                {activeProgress && (effectiveStatus === 'unlocked' || effectiveStatus === 'in_progress') && (
                  <div style={S.actionsRow}>
                    <button
                      type="button"
                      style={{ ...S.btnPrimary, ...(completingModuleId === activeModule.id ? S.btnDisabled : {}) }}
                      disabled={completingModuleId === activeModule.id}
                      onClick={() => void handleMarkReadingComplete()}
                    >
                      <CheckCircle size={15} />
                      {completingModuleId === activeModule.id ? 'Saving…' : 'Mark as complete'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* simulation module */}
          {activeModule && activeModule.module_type === 'simulation' && (
            <div style={S.card}>
              <div style={S.cardHeader}>
                <div style={S.tagSim}>
                  <Target size={11} />
                  Simulation checkpoint
                </div>
                <h2 style={S.moduleHeading}>{activeModule.title}</h2>
                <p style={S.moduleDesc}>{activeModule.description}</p>
              </div>

              <div style={S.cardBody}>
                {!activeProgress ? (
                  <div style={S.msgWarn}>
                    <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>Simulation progress is loading. Refresh the page after your first attempt.</span>
                  </div>
                ) : (
                  <>
                    <div style={S.simDivider}>
                      <span className="cd-divider-line" />
                      <span>Your performance</span>
                      <span className="cd-divider-line" />
                    </div>

                    <div style={S.metaGrid}>
                      <MetaCard label="Passing score" value={`${activeModule.minimum_passing_score}%`} />
                      <MetaCard
                        label="Attempts used"
                        value={`${activeProgress.attempts} / ${activeModule.max_simulation_attempts}`}
                      />
                      <MetaCard
                        label="Best score"
                        value={activeProgress.best_score != null ? `${activeProgress.best_score}%` : '—'}
                        valueColor={
                          activeProgress.best_score != null && activeProgress.best_score >= activeModule.minimum_passing_score
                            ? 'var(--success)'
                            : activeProgress.best_score != null
                            ? 'var(--danger)'
                            : undefined
                        }
                      />
                    </div>

                    {effectiveStatus === 'passed' && activeProgress.best_score != null && (
                      <div style={S.msgSuccess}>
                        <CheckCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                        <span>
                          Passed with {activeProgress.best_score}%
                          {activeProgress.passed_at && (
                            <span style={{ display: 'block', fontSize: 12, opacity: 0.75, marginTop: 2 }}>
                              Completed {new Date(activeProgress.passed_at).toLocaleString()}
                            </span>
                          )}
                        </span>
                      </div>
                    )}

                    {effectiveStatus === 'failed' && activeProgress.attempts >= activeModule.max_simulation_attempts && (
                      <div style={S.msgDanger}>
                        <XCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                        <span>Maximum attempts reached. Contact your supervisor.</span>
                      </div>
                    )}

                    {(effectiveStatus === 'unlocked' ||
                      effectiveStatus === 'in_progress' ||
                      (effectiveStatus === 'failed' && activeProgress.attempts < activeModule.max_simulation_attempts)) && (
                      <div style={{ ...S.actionsRow, flexWrap: 'wrap', gap: 10 }}>
                        <button
                          type="button"
                          style={{
                            ...S.btnPrimary,
                            ...((launchingSim || !activeModule.scenario) ? S.btnDisabled : {}),
                          }}
                          disabled={launchingSim || !activeModule.scenario}
                          onClick={() => void handleLaunchSimulation()}
                        >
                          {effectiveStatus === 'failed'
                            ? <><RotateCcw size={15} /> Retry simulation</>
                            : <><Play size={15} /> Launch simulation</>
                          }
                        </button>
                        <button
                          type="button"
                          style={{
                            ...S.btnSecondary,
                            ...((launchingMission || launchingSim || !activeModule.scenario) ? S.btnDisabled : {}),
                          }}
                          disabled={launchingMission || launchingSim || !activeModule.scenario}
                          onClick={() => void handleLaunchImmersiveMission()}
                        >
                          {launchingMission ? (
                            <>Starting…</>
                          ) : (
                            <>
                              <Sparkles size={15} />
                              Launch immersive mission
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* certificate banner */}
          {certIssued && enrollment.certificate_number && (
            <div style={S.certBanner}>
              <div style={S.certLeft}>
                <Trophy size={28} className="cd-cert-trophy" />
                <div>
                  <p style={S.certHeading}>Certificate earned</p>
                  <p style={S.certNum}>{enrollment.certificate_number}</p>
                </div>
              </div>
              <button
                type="button"
                style={S.certBtn}
                onClick={() => navigate('/dashboard/certifications')}
              >
                View certificate
              </button>
            </div>
          )}

        </main>
      </div>
    </div>
  );
};

export default CourseDetailPage;