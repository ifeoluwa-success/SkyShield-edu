import React, { useState, useEffect, useCallback } from 'react';
import { Users, Search, Filter, Mail, Award, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getStudents } from '../../services/tutorService';
import type { StudentProgress } from '../../types/tutor';
import { showToast } from '../../lib/toast';
import { PageLoader } from '../../components/ui/Loading';
import '../../assets/css/TutorStudents.css';

const TutorStudentsPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentProgress[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
const fetchStudents = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (searchTerm) params.search = searchTerm;
      const data = await getStudents(params);
      setStudents(data);
    } catch {
      showToast({ type: 'error', message: 'Failed to load students' });
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const totalStudents = students.length;
  const avgProgress = students.length > 0
    ? Math.round(students.reduce((acc, s) => acc + (s.progress_percentage || 0), 0) / students.length)
    : 0;
  const totalCertifications = students.reduce((acc, s) => acc + (s.completed_exercises || 0), 0);

  const handleViewDetails = (studentId: string) => {
    navigate(`/tutor/students/${studentId}`);
  };

  return (
    <div className="tutor-students-page">
<div className="page-header">
        <div className="header-content">
          <h1 className="page-title">Students</h1>
          <p className="page-subtitle">Manage and track student progress</p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-header">
            <div className="stat-icon blue"><Users size={24} /></div>
          </div>
          <div className="stat-content">
            <h3 className="stat-value">{totalStudents}</h3>
            <p className="stat-title">Total Students</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-header">
            <div className="stat-icon green"><TrendingUp size={24} /></div>
          </div>
          <div className="stat-content">
            <h3 className="stat-value">{avgProgress}%</h3>
            <p className="stat-title">Avg Progress</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-header">
            <div className="stat-icon purple"><Award size={24} /></div>
          </div>
          <div className="stat-content">
            <h3 className="stat-value">{totalCertifications}</h3>
            <p className="stat-title">Total Certifications</p>
          </div>
        </div>
      </div>

      <div className="content-card">
        <div className="search-filter-bar">
          <div className="search-box">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search students..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="filter-options">
            <button className="filter-button"><Filter size={18} /> Filter</button>
          </div>
        </div>

        <div className="table-container">
          {loading ? (
            <PageLoader message="Loading students…" className="min-h-0 py-12" />
          ) : students.length === 0 ? (
            <div className="empty-state">No students enrolled yet</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Contact</th>
                  <th>Progress</th>
                  <th>Completed</th>
                  <th>Avg Score</th>
                  <th>Last Active</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.student_id}>
                    <td>
                      <div className="student-info">
                        <div className="avatar">{student.student_name.charAt(0)}</div>
                        <span>{student.student_name}</span>
                      </div>
                    </td>
                    <td>
                      <div className="contact-info">
                        <div className="contact-item">
                          <Mail size={14} />
                          <span>{student.student_email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="progress-display">
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${student.progress_percentage || 0}%` }} />
                        </div>
                        <span>{student.progress_percentage || 0}%</span>
                      </div>
                    </td>
                    <td>{student.completed_materials + student.completed_exercises} items</td>
                    <td>
                      <div className={`score ${student.average_score > 80 ? 'high' : student.average_score > 65 ? 'medium' : 'low'}`}>
                        {student.average_score}%
                      </div>
                    </td>
                    <td>{student.last_activity ? new Date(student.last_activity).toLocaleDateString() : 'N/A'}</td>
                    <td>
                      <button className="action-button" onClick={() => handleViewDetails(student.student_id)}>
                        View Details
                      </button>
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

export default TutorStudentsPage;