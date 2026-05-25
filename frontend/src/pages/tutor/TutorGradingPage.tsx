import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, Users, FileText, ChevronRight } from 'lucide-react';
import { getExercisesWithAttempts, type ExerciseWithAttempts } from '../../services/tutorService';
import { showToast } from '../../lib/toast';
import { PageLoader } from '../../components/ui/Loading';
import '../../assets/css/TutorGradingPage.css';

const TutorGradingPage: React.FC = () => {
  const navigate = useNavigate();
  const [exercises, setExercises] = useState<ExerciseWithAttempts[]>([]);
  const [loading, setLoading] = useState(true);
useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await getExercisesWithAttempts();
        setExercises(data.filter(ex => ex.attempts_count > 0));
      } catch {
        showToast({ type: 'error', message: 'Failed to load submissions' });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleViewSubmissions = (exerciseId: string) => {
    navigate(`/tutor/exercises/${exerciseId}/submissions`);
  };

  if (loading) {
    return (
      <div className="grading-page loading">
        <PageLoader message="Loading pending submissions…" className="min-h-0 py-12" />
      </div>
    );
  }

  return (
    <div className="grading-page">
<div className="page-header">
        <h1 className="page-title">
          <ClipboardCheck size={28} /> Pending Grading
        </h1>
        <p className="page-subtitle">Exercises with student submissions awaiting review</p>
      </div>

      {exercises.length === 0 ? (
        <div className="empty-state">
          <ClipboardCheck size={48} />
          <p>No pending submissions to grade. Great job!</p>
        </div>
      ) : (
        <div className="grading-list">
          {exercises.map((exercise) => (
            <div key={exercise.id} className="grading-card">
              <div className="grading-card-header">
                <div className="exercise-icon">
                  <FileText size={24} />
                </div>
                <div className="exercise-info">
                  <h3>{exercise.title}</h3>
                  <p className="exercise-meta">
                    Type: {exercise.exercise_type.replace('_', ' ')} | 
                    Passing: {exercise.passing_score}% | 
                    Max attempts: {exercise.max_attempts}
                  </p>
                </div>
              </div>
              <div className="grading-card-stats">
                <div className="stat">
                  <Users size={16} />
                  <span>{exercise.attempts_count} submission{exercise.attempts_count !== 1 ? 's' : ''}</span>
                </div>
              </div>
              <div className="grading-card-actions">
                <button onClick={() => handleViewSubmissions(exercise.id)} className="grade-btn">
                  Review Submissions <ChevronRight size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TutorGradingPage;