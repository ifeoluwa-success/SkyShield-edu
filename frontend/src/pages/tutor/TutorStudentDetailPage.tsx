// src/pages/tutor/TutorStudentDetailPage.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Mail, TrendingUp, BookOpen, ClipboardList, Users,
  Award, AlertCircle, CheckCircle, MessageSquare,
} from 'lucide-react';
import { getStudentProgress, addStudentNotes } from '../../services/tutorService';
import type { StudentProgress } from '../../types/tutor';
import { showToast } from '../../lib/toast';
import { PageLoader, Spinner } from '../../components/ui/Loading';
import '../../assets/css/TutorStudentDetail.css';

const TutorStudentDetailPage: React.FC = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();

  const [student, setStudent] = useState<StudentProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [showNotesForm, setShowNotesForm] = useState(false);

  useEffect(() => {
    if (!studentId) return;
    const load = async () => {
      try {
        const data = await getStudentProgress(studentId);
        setStudent(data);
      } catch {
        showToast({ type: 'error', message: 'Failed to load student details' });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [studentId]);

  const handleSaveNotes = async () => {
    if (!studentId || !notes.trim()) return;
    setSavingNotes(true);
    try {
      await addStudentNotes(studentId, notes);
      showToast({ type: 'success', message: 'Notes saved successfully' });
      setNotes('');
      setShowNotesForm(false);
    } catch {
      showToast({ type: 'error', message: 'Failed to save notes' });
    } finally {
      setSavingNotes(false);
    }
  };

  if (loading) {
    return (
      <div className="student-detail-page loading">
        <div className="sd-loading"><PageLoader message="Loading student details…" className="min-h-0 py-12" /></div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="student-detail-page">
        <div className="sd-error">
          <AlertCircle size={40} />
          <p>Student not found.</p>
          <button className="sd-back-btn" onClick={() => navigate(-1)}>Go Back</button>
        </div>
      </div>
    );
  }

  const progress = student.progress_percentage ?? 0;
  const scoreClass = student.average_score > 80 ? 'high' : student.average_score > 65 ? 'medium' : 'low';

  return (
    <div className="student-detail-page">
{/* Header */}
      <div className="sd-header">
        <button className="sd-back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={18} /> Back to Students
        </button>
        <div className="sd-title-row">
          <div className="sd-avatar">{student.student_name.charAt(0).toUpperCase()}</div>
          <div className="sd-title-info">
            <h1>{student.student_name}</h1>
            <div className="sd-contact">
              <Mail size={14} /> {student.student_email}
            </div>
          </div>
          <button className="sd-notes-btn" onClick={() => setShowNotesForm(v => !v)}>
            <MessageSquare size={16} /> Add Notes
          </button>
        </div>
      </div>

      {/* Notes form */}
      {showNotesForm && (
        <div className="sd-notes-form">
          <textarea
            rows={4}
            placeholder="Write notes about this student…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
          <div className="sd-notes-actions">
            <button className="sd-cancel-btn" onClick={() => setShowNotesForm(false)}>Cancel</button>
            <button className="sd-save-btn" onClick={handleSaveNotes} disabled={savingNotes || !notes.trim()}>
              {savingNotes ? <Spinner size="xs" /> : <CheckCircle size={14} />}
              Save Notes
            </button>
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="sd-stats">
        <div className="sd-stat-card">
          <div className="sd-stat-icon blue"><TrendingUp size={22} /></div>
          <div className="sd-stat-body">
            <div className="sd-stat-value">{progress}%</div>
            <div className="sd-stat-label">Overall Progress</div>
          </div>
        </div>
        <div className="sd-stat-card">
          <div className={`sd-stat-icon ${scoreClass}`}><Award size={22} /></div>
          <div className="sd-stat-body">
            <div className="sd-stat-value">{student.average_score}%</div>
            <div className="sd-stat-label">Average Score</div>
          </div>
        </div>
        <div className="sd-stat-card">
          <div className="sd-stat-icon green"><BookOpen size={22} /></div>
          <div className="sd-stat-body">
            <div className="sd-stat-value">{student.completed_materials}</div>
            <div className="sd-stat-label">Materials Done</div>
          </div>
        </div>
        <div className="sd-stat-card">
          <div className="sd-stat-icon purple"><ClipboardList size={22} /></div>
          <div className="sd-stat-body">
            <div className="sd-stat-value">{student.completed_exercises}</div>
            <div className="sd-stat-label">Exercises Done</div>
          </div>
        </div>
        <div className="sd-stat-card">
          <div className="sd-stat-icon orange"><Users size={22} /></div>
          <div className="sd-stat-body">
            <div className="sd-stat-value">{student.meetings_attended}</div>
            <div className="sd-stat-label">Meetings Attended</div>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="sd-progress-section">
        <div className="sd-progress-label">
          <span>Learning Progress</span>
          <span>{progress}%</span>
        </div>
        <div className="sd-progress-track">
          <div className="sd-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Strengths & Areas for Improvement */}
      <div className="sd-feedback-grid">
        {student.strengths?.length > 0 && (
          <div className="sd-feedback-card strengths">
            <div className="sd-feedback-header">
              <CheckCircle size={18} />
              <h3>Strengths</h3>
            </div>
            <ul>
              {student.strengths.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        )}
        {student.areas_for_improvement?.length > 0 && (
          <div className="sd-feedback-card improvements">
            <div className="sd-feedback-header">
              <AlertCircle size={18} />
              <h3>Areas to Improve</h3>
            </div>
            <ul>
              {student.areas_for_improvement.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        )}
      </div>

      {/* Last activity */}
      {student.last_activity && (
        <p className="sd-last-active">
          Last active: {new Date(student.last_activity).toLocaleDateString(undefined, {
            weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
          })}
        </p>
      )}
    </div>
  );
};

export default TutorStudentDetailPage;
