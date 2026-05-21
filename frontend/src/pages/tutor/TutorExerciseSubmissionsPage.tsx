import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, Clock, Award, CheckCircle, XCircle, Edit2, Save, FileText } from 'lucide-react';
import { getExerciseAttempts, updateExerciseAttempt, type ExerciseAttemptDetail } from '../../services/tutorService';
import { usePortalBasePath } from '../../hooks/usePortalBasePath';
import Toast from '../../components/Toast';
import { PageLoader } from '../../components/ui/Loading';
import '../../assets/css/RoleDashboard.css';
import '../../assets/css/TutorExerciseSubmissions.css';

const PASS_THRESHOLD = 70;

function normalizeScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.min(100, Math.max(0, Math.round(score * 10) / 10));
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m === 0) return `${s} sec`;
  return `${m} min ${s} sec`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function StudentAnswers({ answers }: { answers: Record<string, unknown> | unknown[] }) {
  const rows: { key: string; value: string }[] = [];

  if (Array.isArray(answers)) {
    answers.forEach((item, i) => {
      if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>;
        const q = String(o.question_id ?? o.question ?? `Question ${i + 1}`);
        const a = o.selected_option ?? o.correct_option ?? o.answer ?? o.value;
        rows.push({ key: q, value: a != null ? String(a) : '—' });
      }
    });
  } else if (answers && typeof answers === 'object') {
    Object.entries(answers).forEach(([k, v]) => {
      rows.push({ key: k, value: v != null ? String(v) : '—' });
    });
  }

  if (rows.length === 0) {
    return <p className="answers-empty">No answers recorded.</p>;
  }

  return (
    <ul className="answers-list">
      {rows.map((row, i) => (
        <li key={`${row.key}-${i}`}>
          <span className="answer-q">{row.key}</span>
          <span className="answer-a">{row.value}</span>
        </li>
      ))}
    </ul>
  );
}

const TutorExerciseSubmissionsPage: React.FC = () => {
  const { exerciseId } = useParams<{ exerciseId: string }>();
  const navigate = useNavigate();
  const basePath = usePortalBasePath();
  const [attempts, setAttempts] = useState<ExerciseAttemptDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editScore, setEditScore] = useState<number>(0);
  const [editFeedback, setEditFeedback] = useState<string>('');
  const [filterStudent, setFilterStudent] = useState('');
  const [filterPassed, setFilterPassed] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchAttempts = useCallback(async () => {
    if (!exerciseId) return;
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (filterStudent) params.student_id = filterStudent;
      if (filterPassed) params.passed = filterPassed;
      const data = await getExerciseAttempts(exerciseId, params);
      setAttempts(data);
    } catch {
      setToast({ type: 'error', message: 'Failed to load submissions' });
    } finally {
      setLoading(false);
    }
  }, [exerciseId, filterStudent, filterPassed]);

  useEffect(() => {
    fetchAttempts();
  }, [fetchAttempts]);

  const handleEdit = (attempt: ExerciseAttemptDetail) => {
    setEditingId(attempt.id);
    setEditScore(normalizeScore(attempt.score));
    setEditFeedback(attempt.feedback || '');
  };

  const handleSave = async (attemptId: string) => {
    const score = normalizeScore(editScore);
    setSavingId(attemptId);
    try {
      const updated = await updateExerciseAttempt(attemptId, {
        score,
        feedback: editFeedback,
        passed: score >= PASS_THRESHOLD,
      });
      setAttempts(prev => prev.map(a => (a.id === attemptId ? updated : a)));
      setToast({ type: 'success', message: 'Grade updated' });
      setEditingId(null);
    } catch {
      setToast({ type: 'error', message: 'Failed to update grade' });
    } finally {
      setSavingId(null);
    }
  };

  const uniqueStudents = Array.from(new Set(attempts.map(a => a.student_id))).map(id => {
    const attempt = attempts.find(a => a.student_id === id);
    return { id, name: attempt?.student_name || id };
  });

  if (loading) {
    return (
      <div className="role-dashboard submissions-page loading">
        <PageLoader message="Loading submissions…" className="min-h-0 py-12" />
      </div>
    );
  }

  return (
    <div className="role-dashboard submissions-page">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="page-header">
        <button
          type="button"
          className="btn-secondary back-button"
          onClick={() => navigate(`${basePath}/exercises`)}
        >
          <ArrowLeft size={18} /> Back to Exercises
        </button>
        <h1 className="page-title">Exercise Submissions</h1>
        <p className="page-subtitle">Review and grade student attempts</p>
      </div>

      <div className="filters-bar">
        <div className="filter-group">
          <Users size={16} aria-hidden />
          <select value={filterStudent} onChange={e => setFilterStudent(e.target.value)} aria-label="Filter by student">
            <option value="">All Students</option>
            {uniqueStudents.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <Award size={16} aria-hidden />
          <select value={filterPassed} onChange={e => setFilterPassed(e.target.value)} aria-label="Filter by pass status">
            <option value="">All</option>
            <option value="true">Passed</option>
            <option value="false">Failed</option>
          </select>
        </div>
        <button type="button" className="btn-secondary refresh-btn" onClick={fetchAttempts}>
          Refresh
        </button>
      </div>

      {attempts.length === 0 ? (
        <div className="empty-state">
          <FileText size={48} strokeWidth={1.25} />
          <p>No submissions yet for this exercise.</p>
        </div>
      ) : (
        <div className="attempts-list">
          {attempts.map(attempt => {
            const displayScore = normalizeScore(attempt.score);
            const isEditing = editingId === attempt.id;

            return (
              <article key={attempt.id} className="attempt-card">
                <header className="attempt-header">
                  <div className="student-info">
                    <span className="student-name">{attempt.student_name}</span>
                    <span className="student-email">{attempt.student_email}</span>
                  </div>
                  <div className="attempt-badges">
                    <span className={`pass-badge ${attempt.passed ? 'passed' : 'failed'}`}>
                      {attempt.passed ? <CheckCircle size={14} /> : <XCircle size={14} />}
                      {attempt.passed ? 'Passed' : 'Failed'}
                    </span>
                    <span className="attempt-number">Attempt #{attempt.attempt_number}</span>
                  </div>
                </header>

                <div className="attempt-details">
                  <div className="detail-item">
                    <Clock size={14} aria-hidden />
                    <span className="detail-label">Started</span>
                    <span className="detail-value">{formatDate(attempt.started_at)}</span>
                  </div>
                  <div className="detail-item">
                    <Clock size={14} aria-hidden />
                    <span className="detail-label">Completed</span>
                    <span className="detail-value">{formatDate(attempt.completed_at)}</span>
                  </div>
                  <div className="detail-item">
                    <Clock size={14} aria-hidden />
                    <span className="detail-label">Time taken</span>
                    <span className="detail-value">{formatDuration(attempt.time_taken)}</span>
                  </div>
                </div>

                <section className="attempt-answers">
                  <h4>Student answers</h4>
                  <StudentAnswers answers={attempt.answers as Record<string, unknown> | unknown[]} />
                </section>

                <section className="grading-section">
                  {isEditing ? (
                    <>
                      <div className="grade-field">
                        <label htmlFor={`score-${attempt.id}`}>Score (%)</label>
                        <input
                          id={`score-${attempt.id}`}
                          className="grade-input"
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={editScore}
                          onChange={e => setEditScore(normalizeScore(Number(e.target.value)))}
                        />
                      </div>
                      <div className="feedback-field">
                        <label htmlFor={`feedback-${attempt.id}`}>Feedback</label>
                        <textarea
                          id={`feedback-${attempt.id}`}
                          className="feedback-input"
                          rows={3}
                          value={editFeedback}
                          onChange={e => setEditFeedback(e.target.value)}
                          placeholder="Add feedback for the student…"
                        />
                      </div>
                      <div className="action-buttons">
                        <button
                          type="button"
                          className="btn-primary save-btn"
                          disabled={savingId === attempt.id}
                          onClick={() => handleSave(attempt.id)}
                        >
                          <Save size={16} /> {savingId === attempt.id ? 'Saving…' : 'Save'}
                        </button>
                        <button type="button" className="btn-secondary cancel-btn" onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="current-grade">
                        <span className="grade-label">Current score</span>
                        <span className={`grade-value ${displayScore >= PASS_THRESHOLD ? 'pass' : 'fail'}`}>
                          {displayScore}%
                        </span>
                      </div>
                      {attempt.feedback ? (
                        <div className="current-feedback">
                          <span className="feedback-label">Feedback</span>
                          <p>{attempt.feedback}</p>
                        </div>
                      ) : null}
                      <button type="button" className="btn-secondary edit-grade-btn" onClick={() => handleEdit(attempt)}>
                        <Edit2 size={16} /> Edit grade
                      </button>
                    </>
                  )}
                </section>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TutorExerciseSubmissionsPage;
