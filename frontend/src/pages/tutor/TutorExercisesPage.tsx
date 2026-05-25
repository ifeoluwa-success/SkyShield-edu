import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FileText, 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Eye, 
  X, 
  Clock, 
  Award, 
  BarChart, 
  Download, 
  FolderOpen,
  Users   // Added for Submissions button
} from 'lucide-react';

import { getExercises, createExercise, deleteExercise } from '../../services/tutorService';
import type { Exercise, Question } from '../../types/tutor';
import { showToast } from '../../lib/toast';
import { PageLoader, Spinner } from '../../components/ui/Loading';
import '../../assets/css/TutorExercises.css';

const TutorExercisesPage: React.FC = () => {
  const navigate = useNavigate();

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [creating, setCreating] = useState(false);

  const [newExercise, setNewExercise] = useState<Omit<Exercise, 'id' | 'created_at' | 'updated_at'>>({
    title: '',
    description: '',
    exercise_type: 'multiple_choice',
    time_limit_minutes: 30,
    passing_score: 70,
    max_attempts: 3,
    is_published: false,
    questions: [{ text: '', options: ['', '', '', ''], correct: 0 }],
  });

  const fetchExercises = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (searchTerm) params.search = searchTerm;
      if (filterType) params.exercise_type = filterType;
      
      const data = await getExercises(params);
      setExercises(data);
    } catch {
      showToast({ type: 'error', message: 'Failed to load exercises' });
    } finally {
      setLoading(false);
    }
  }, [searchTerm, filterType]);

  useEffect(() => {
    fetchExercises();
  }, [fetchExercises]);

  const handleCreateExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExercise.title) {
      showToast({ type: 'error', message: 'Title is required' });
      return;
    }

    setCreating(true);
    try {
      await createExercise(newExercise);
      showToast({ type: 'success', message: 'Exercise created successfully' });
      setShowCreateModal(false);
      
      // Reset form
      setNewExercise({
        title: '',
        description: '',
        exercise_type: 'multiple_choice',
        time_limit_minutes: 30,
        passing_score: 70,
        max_attempts: 3,
        is_published: false,
        questions: [{ text: '', options: ['', '', '', ''], correct: 0 }],
      });
      
      fetchExercises();
    } catch {
      showToast({ type: 'error', message: 'Failed to create exercise' });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this exercise?')) return;

    try {
      await deleteExercise(id);
      showToast({ type: 'success', message: 'Exercise deleted successfully' });
      fetchExercises();
    } catch {
      showToast({ type: 'error', message: 'Failed to delete exercise' });
    }
  };

  // Navigate to submissions page for a specific exercise
  const handleViewSubmissions = (exerciseId: string) => {
    navigate(`/tutor/exercises/${exerciseId}/submissions`);
  };

  const addQuestion = () => {
    setNewExercise({
      ...newExercise,
      questions: [...newExercise.questions, { text: '', options: ['', '', '', ''], correct: 0 }],
    });
  };

  const removeQuestion = (index: number) => {
    const newQuestions = [...newExercise.questions];
    newQuestions.splice(index, 1);
    setNewExercise({ ...newExercise, questions: newQuestions });
  };

  const updateQuestion = (index: number, field: keyof Question, value: string | number | string[]) => {
    const newQuestions = [...newExercise.questions];
    if (field === 'text') newQuestions[index].text = value as string;
    else if (field === 'correct') newQuestions[index].correct = value as number;
    else if (field === 'options') newQuestions[index].options = value as string[];
    setNewExercise({ ...newExercise, questions: newQuestions });
  };

  const updateOption = (qIndex: number, optIndex: number, value: string) => {
    const newQuestions = [...newExercise.questions];
    newQuestions[qIndex].options[optIndex] = value;
    setNewExercise({ ...newExercise, questions: newQuestions });
  };

  return (
    <div className="tutor-exercises-page">
{/* Create Exercise Modal */}
      {showCreateModal && (
        <div className="create-exercise-modal-overlay">
          <div className="create-exercise-modal">
            <div className="modal-header">
              <h3>Create New Exercise</h3>
              <button className="close-btn" onClick={() => setShowCreateModal(false)}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleCreateExercise} className="exercise-form">
              {/* ... Your existing modal form content remains unchanged ... */}
              <div className="form-section">
                <h4>Exercise Details</h4>
                <div className="form-group">
                  <label>Exercise Title *</label>
                  <input
                    type="text"
                    placeholder="Enter exercise title"
                    value={newExercise.title}
                    onChange={(e) => setNewExercise({ ...newExercise, title: e.target.value })}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    placeholder="Describe the exercise content"
                    value={newExercise.description}
                    onChange={(e) => setNewExercise({ ...newExercise, description: e.target.value })}
                    rows={3}
                  />
                </div>
                
                <div className="form-row">
                  <div className="form-group">
                    <label>Category</label>
                    <select
                      value={newExercise.exercise_type}
                      onChange={(e) => setNewExercise({ ...newExercise, exercise_type: e.target.value })}
                    >
                      <option value="multiple_choice">Multiple Choice</option>
                      <option value="fill_blanks">Fill in the Blanks</option>
                      <option value="matching">Matching</option>
                      <option value="scenario">Scenario Based</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="form-section">
                <h4>Exercise Configuration</h4>
                <div className="form-row">
                  <div className="form-group">
                    <label><Clock size={16} /> Time Limit (minutes)</label>
                    <input
                      type="number"
                      min="5"
                      max="180"
                      value={newExercise.time_limit_minutes}
                      onChange={(e) => setNewExercise({ ...newExercise, time_limit_minutes: parseInt(e.target.value) || 30 })}
                    />
                  </div>
                  
                  <div className="form-group">
                    <label><Award size={16} /> Passing Score (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={newExercise.passing_score}
                      onChange={(e) => setNewExercise({ ...newExercise, passing_score: parseInt(e.target.value) || 70 })}
                    />
                  </div>
                </div>
                
                <div className="form-row">
                  <div className="form-group">
                    <label><BarChart size={16} /> Max Attempts</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={newExercise.max_attempts}
                      onChange={(e) => setNewExercise({ ...newExercise, max_attempts: parseInt(e.target.value) || 3 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select
                      value={newExercise.is_published ? 'published' : 'draft'}
                      onChange={(e) => setNewExercise({ ...newExercise, is_published: e.target.value === 'published' })}
                    >
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="form-section">
                <h4>Questions</h4>
                {newExercise.questions.map((q, idx) => (
                  <div key={idx} className="question-item">
                    <div className="question-header">
                      <span>Question {idx + 1}</span>
                      {newExercise.questions.length > 1 && (
                        <button type="button" className="remove-btn" onClick={() => removeQuestion(idx)}>
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="form-group">
                      <label>Question Text</label>
                      <textarea
                        rows={2}
                        value={q.text}
                        onChange={(e) => updateQuestion(idx, 'text', e.target.value)}
                        placeholder="Enter question text"
                      />
                    </div>
                    <div className="form-group">
                      <label>Options (for multiple choice)</label>
                      {q.options.map((opt, optIdx) => (
                        <input
                          key={optIdx}
                          type="text"
                          value={opt}
                          onChange={(e) => updateOption(idx, optIdx, e.target.value)}
                          placeholder={`Option ${optIdx + 1}`}
                        />
                      ))}
                    </div>
                    <div className="form-group">
                      <label>Correct Option Index (0-based)</label>
                      <input
                        type="number"
                        min="0"
                        max={q.options.length - 1}
                        value={q.correct}
                        onChange={(e) => updateQuestion(idx, 'correct', parseInt(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                ))}
                <button type="button" className="add-question-btn" onClick={addQuestion}>
                  <Plus size={16} /> Add Question
                </button>
              </div>
              
              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="submit-btn" disabled={creating}>
                  {creating ? <Spinner size="sm" /> : <Plus size={18} />}
                  {creating ? 'Creating...' : 'Create Exercise'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="page-header">
        <div className="header-content">
          <h1 className="page-title">Exercises</h1>
          <p className="page-subtitle">Create and manage training exercises for your students</p>
        </div>
        <button className="primary-button" onClick={() => setShowCreateModal(true)}>
          <Plus size={20} />
          <span>Create Exercise</span>
        </button>
      </div>

      <div className="content-card">
        <div className="search-filter-bar">
          <div className="search-box">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search exercises..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="filter-options">
            <select
              className="type-filter"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="">All Types</option>
              <option value="multiple_choice">Multiple Choice</option>
              <option value="fill_blanks">Fill in the Blanks</option>
              <option value="matching">Matching</option>
              <option value="scenario">Scenario Based</option>
            </select>
            <button className="export-button">
              <Download size={18} />
              Export
            </button>
          </div>
        </div>

        <div className="table-container">
          {loading ? (
            <PageLoader message="Loading exercises…" className="min-h-0 py-12" />
          ) : exercises.length === 0 ? (
            <div className="empty-state-container">
              <FolderOpen size={64} className="empty-icon" />
              <h3>No exercises yet</h3>
              <p>Create your first exercise to start testing your students.</p>
              <button className="primary-button" onClick={() => setShowCreateModal(true)}>
                <Plus size={18} />
                Create Exercise
              </button>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Exercise Name</th>
                  <th>Type</th>
                  <th>Questions</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {exercises.map((exercise) => (
                  <tr key={exercise.id}>
                    <td>
                      <div className="exercise-info">
                        <FileText size={20} />
                        <div>
                          <div className="exercise-name">{exercise.title}</div>
                          <div className="exercise-meta">
                            <span className="exercise-id">ID: {exercise.id.slice(0, 8)}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>{exercise.exercise_type.replace('_', ' ')}</td>
                    <td>{exercise.questions?.length || 0}</td>
                    <td>
                      <span className={`status-badge ${exercise.is_published ? 'published' : 'draft'}`}>
                        {exercise.is_published ? 'Published' : 'Draft'}
                      </span>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button className="icon-btn view" title="Preview">
                          <Eye size={16} />
                        </button>
                        <button className="icon-btn edit" title="Edit">
                          <Edit size={16} />
                        </button>
                        <button 
                          className="icon-btn submissions" 
                          title="View Submissions"
                          onClick={() => handleViewSubmissions(exercise.id)}
                        >
                          <Users size={16} />
                        </button>
                        <button className="icon-btn stats" title="Statistics">
                          <BarChart size={16} />
                        </button>
                        <button 
                          className="icon-btn delete" 
                          title="Delete" 
                          onClick={() => handleDelete(exercise.id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default TutorExercisesPage;