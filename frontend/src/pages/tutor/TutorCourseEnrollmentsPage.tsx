import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { PageLoader } from '../../components/ui/Loading';
import { useAuth } from '../../hooks/useAuth';
import type { CourseEnrollment, ModuleProgress } from '../../types/course';
import { getCourseEnrollments, resetModuleAttempts } from '../../services/courseService';
import { showToast } from '../../lib/toast';
const statusClass = (s: CourseEnrollment['status']) => {
  switch (s) {
    case 'completed':
    case 'certificate_issued':
      return 'bg-emerald-500/20 text-emerald-300';
    case 'in_progress':
      return 'bg-sky-500/20 text-sky-300';
    default:
      return 'bg-slate-600/40 text-slate-300';
  }
};

const TutorCourseEnrollmentsPage: React.FC = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = location.pathname.startsWith('/admin') ? '/admin' : '/tutor';
  const { user, isTrainee } = useAuth();

  const [enrollments, setEnrollments] = useState<CourseEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [resetRow, setResetRow] = useState<{
    enrollmentId: string;
    moduleId: string;
    traineeId: string;
  } | null>(null);
  const [resetting, setResetting] = useState(false);

  const canAccess = user?.role === 'supervisor' || user?.role === 'admin' || user?.role === 'instructor';

  const load = useCallback(async () => {
    if (!courseId) return;
    try {
      setLoading(true);
      const data = await getCourseEnrollments(courseId);
      setEnrollments(data);
    } catch {
      showToast({ type: 'error', message: 'Failed to load enrollments' });
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const courseTitle = enrollments[0]?.course.title ?? 'Course';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return enrollments;
    return enrollments.filter(e => {
      const name = (e.trainee_username ?? e.user?.username ?? '').toLowerCase();
      return name.includes(q);
    });
  }, [enrollments, search]);

  const failedModulesForTrainee = (e: CourseEnrollment): ModuleProgress[] =>
    e.module_progresses.filter(p => p.status === 'failed');

  const progressCounts = (e: CourseEnrollment) => {
    const passed = e.module_progresses.filter(p => p.status === 'passed').length;
    const total = e.course.modules?.length ?? e.course.module_count ?? 0;
    return { passed, total };
  };

  const openReset = (e: CourseEnrollment) => {
    const fails = failedModulesForTrainee(e);
    const first = fails[0];
    const tid = e.trainee_id ?? e.user?.id;
    if (!first || !tid) {
      showToast({
        type: 'info',
        message: 'No failed modules or trainee id is missing for this enrollment',
      });
      return;
    }
    setResetRow({
      enrollmentId: e.id,
      moduleId: first.module.id,
      traineeId: tid,
    });
  };

  const submitReset = async () => {
    if (!courseId || !resetRow) return;
    try {
      setResetting(true);
      await resetModuleAttempts(courseId, resetRow.moduleId, resetRow.traineeId);
      showToast({ type: 'success', message: 'Module attempts reset' });
      setResetRow(null);
      await load();
    } catch {
      showToast({ type: 'error', message: 'Reset failed' });
    } finally {
      setResetting(false);
    }
  };

  if (isTrainee || !canAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!courseId) {
    return <Navigate to={`${basePath}/courses`} replace />;
  }

  return (
    <div className="tutor-page px-4 py-8 md:px-8">
<button
        type="button"
        onClick={() => navigate(`${basePath}/courses`)}
        className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-amber-400"
      >
        <ArrowLeft size={16} />
        Back to courses
      </button>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">{courseTitle}</h1>
          <p className="mt-1 text-slate-400">Enrollments</p>
        </div>
        <span className="w-fit rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-sm text-slate-200">
          {enrollments.length} enrolled
        </span>
      </div>

      <input
        type="search"
        placeholder="Filter by trainee username…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="mb-6 w-full max-w-sm rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
      />

      {loading ? (
        <PageLoader message="Loading enrollments…" className="min-h-0 py-16" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-700 bg-slate-900/40">
          <table className="min-w-full divide-y divide-slate-700 text-left text-sm">
            <thead className="bg-slate-800/80 text-slate-300">
              <tr>
                <th className="px-4 py-3 font-medium">Trainee</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Progress</th>
                <th className="px-4 py-3 font-medium">Avg score</th>
                <th className="px-4 py-3 font-medium">Certificate</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700 text-slate-200">
              {filtered.map(e => {
                const { passed, total } = progressCounts(e);
                const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
                const fails = failedModulesForTrainee(e);
                const isOpen = resetRow?.enrollmentId === e.id;

                return (
                  <React.Fragment key={e.id}>
                    <tr className="hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-medium">
                        {e.trainee_username ?? e.user?.username ?? e.trainee_id ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${statusClass(e.status)}`}>
                          {e.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="mb-1 text-xs text-slate-400">
                          {passed}/{total} modules
                        </div>
                        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full bg-sky-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {e.average_simulation_score != null ? `${e.average_simulation_score}%` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {e.certificate_number ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => (isOpen ? setResetRow(null) : openReset(e))}
                          disabled={fails.length === 0}
                          className="text-amber-400 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Reset module
                        </button>
                      </td>
                    </tr>
                    {isOpen && resetRow && (
                      <tr className="bg-slate-950/60">
                        <td colSpan={6} className="px-4 py-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                            <label className="block text-xs text-slate-400">
                              Failed module
                              <select
                                value={resetRow.moduleId}
                                onChange={ev =>
                                  setResetRow(r =>
                                    r ? { ...r, moduleId: ev.target.value } : r,
                                  )
                                }
                                className="mt-1 block w-full min-w-[200px] rounded border border-slate-600 bg-slate-900 px-2 py-2 text-sm text-slate-100 sm:w-72"
                              >
                                {fails.map(fp => (
                                  <option key={fp.module.id} value={fp.module.id}>
                                    {fp.module.title} ({fp.module.module_type})
                                  </option>
                                ))}
                              </select>
                            </label>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={resetting}
                                onClick={() => void submitReset()}
                                className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-500 disabled:opacity-60"
                              >
                                {resetting ? '…' : 'Confirm reset'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setResetRow(null)}
                                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="p-8 text-center text-slate-500">No enrollments match your search.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default TutorCourseEnrollmentsPage;
