// src/pages/dashboard/ExercisesPage.tsx
import React, { useState, useEffect } from 'react';
import { ClipboardList, Clock, Award, CheckCircle, AlertCircle } from 'lucide-react';
import { getAssignedExercises, submitExerciseAttempt, type AssignedExercise } from '../../services/simulationService';
import { showToast } from '../../lib/toast';
import { PageLoader, Spinner } from '../../components/ui/Loading';
import '../../assets/css/ExercisesPage.css';

const ExercisesPage: React.FC = () => {
  const [exercises, setExercises] = useState<AssignedExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<AssignedExercise | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchExercises();
  }, []);

  const fetchExercises = async () => {
    try {
      setLoading(true);
      const data = await getAssignedExercises();
      setExercises(data);
    } catch {
      showToast({ type: 'error', message: 'Failed to load exercises' });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (exerciseId: string) => {
    if (!selectedExercise) return;
    setSubmitting(exerciseId);
    try {
      const result = await submitExerciseAttempt(exerciseId, answers);
      showToast({
        type: result.passed ? 'success' : 'info',
        message: result.passed
          ? `Great job! You scored ${result.score}% and passed.`
          : `You scored ${result.score}%. ${result.feedback || 'Keep practicing!'}`,
      });
      setSelectedExercise(null);
      setAnswers({});
      fetchExercises(); // refresh list
    } catch {
      showToast({ type: 'error', message: 'Failed to submit exercise' });
    } finally {
      setSubmitting(null);
    }
  };

  const getStatusBadge = (status: AssignedExercise['status']) => {
    switch (status) {
      case 'completed':
        return <span className="status-badge completed"><CheckCircle size={14} /> Completed</span>;
      case 'in_progress':
        return <span className="status-badge in-progress"><Clock size={14} /> In Progress</span>;
      default:
        return <span className="status-badge pending"><AlertCircle size={14} /> Pending</span>;
    }
  };

  if (loading) {
    return (
      <div className="exercises-page loading">
        <PageLoader message="Loading exercises…" className="min-h-0 py-12" />
      </div>
    );
  }

  if (selectedExercise) {
    // For simplicity, a basic form – you can expand with proper question types
    return (
      <div className="exercises-page">
        <div className="exercise-form-container">
          <button className="back-btn" onClick={() => setSelectedExercise(null)}>← Back to exercises</button>
          <div className="exercise-form">
            <h2>{selectedExercise.title}</h2>
            <p>{selectedExercise.description}</p>
            <div className="exercise-meta">
              <span><Clock size={14} /> Time limit: {selectedExercise.time_limit_minutes} min</span>
              <span><Award size={14} /> Passing score: {selectedExercise.passing_score}%</span>
              <span>Max attempts: {selectedExercise.max_attempts}</span>
            </div>
            {/* Placeholder for actual questions – replace with dynamic fields */}
            <textarea
              className="answer-input"
              placeholder="Write your answer here..."
              value={answers.text || ''}
              onChange={(e) => setAnswers({ text: e.target.value })}
              rows={8}
            />
            <button
              className="submit-exercise-btn"
              onClick={() => handleSubmit(selectedExercise.id)}
              disabled={submitting === selectedExercise.id}
            >
              {submitting === selectedExercise.id ? <Spinner size="sm" /> : 'Submit Exercise'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="exercises-page">
<div className="page-header">
        <h1 className="page-title">Exercises</h1>
        <p className="page-subtitle">Complete assigned tasks to test your knowledge</p>
      </div>

      {exercises.length === 0 ? (
        <div className="empty-state">
          <ClipboardList size={48} />
          <p>No exercises assigned at the moment. Check back later!</p>
        </div>
      ) : (
        <div className="exercises-grid">
          {exercises.map((ex) => (
            <div key={ex.id} className="exercise-card">
              <div className="exercise-header">
                <div className="exercise-icon"><ClipboardList size={24} /></div>
                {getStatusBadge(ex.status)}
              </div>
              <div className="exercise-content">
                <h3>{ex.title}</h3>
                <p>{ex.description}</p>
                <div className="exercise-meta">
                  <span><Clock size={14} /> {ex.time_limit_minutes} min</span>
                  <span><Award size={14} /> {ex.passing_score}% to pass</span>
                  {ex.due_date && <span>Due: {new Date(ex.due_date).toLocaleDateString()}</span>}
                  {ex.score !== undefined && <span>Your score: {ex.score}%</span>}
                </div>
              </div>
              <div className="exercise-footer">
                {ex.status === 'completed' ? (
                  <button className="review-btn" onClick={() => setSelectedExercise(ex)}>Review</button>
                ) : (
                  <button className="start-exercise-btn" onClick={() => setSelectedExercise(ex)}>
                    {ex.status === 'in_progress' ? 'Continue' : 'Start Exercise'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ExercisesPage;