import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { showToast } from '../../lib/toast';
import { PageLoader } from '../../components/ui/Loading';
import { enrollInCourse, getCourses, getMyEnrollments } from '../../services/courseService';
import type { Course, CourseEnrollment } from '../../types/course';
import '../../assets/css/Simulationdash.css';
import '../../assets/css/CoursesPage.css';

// ─── Constants ───────────────────────────────────────────────────────────────
const DIFFICULTY_LABELS: Record<number, string> = { 1: 'Beginner', 2: 'Intermediate', 3: 'Advanced', 4: 'Expert' };

function difficultyBadgeClass(d: Course['difficulty']): string {
  switch (d) {
    case 1:
      return 'beginner';
    case 2:
      return 'intermediate';
    case 3:
      return 'advanced';
    case 4:
      return 'expert';
    default:
      return 'beginner';
  }
}

const THREAT_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
  ransomware:    { icon: '🔒', color: '#534AB7', bg: 'rgba(83,74,183,0.12)' },
  gps:           { icon: '🛰️', color: '#185FA5', bg: 'rgba(24,95,165,0.12)' },
  navigation:    { icon: '🛰️', color: '#185FA5', bg: 'rgba(24,95,165,0.12)' },
  social:        { icon: '🎭', color: '#993C1D', bg: 'rgba(153,60,29,0.12)' },
  phish:         { icon: '🎣', color: '#993C1D', bg: 'rgba(153,60,29,0.12)' },
  unauthorized:  { icon: '⚠️', color: '#854F0B', bg: 'rgba(133,79,11,0.12)' },
  apt:           { icon: '🕵️', color: '#A32D2D', bg: 'rgba(163,45,45,0.12)' },
  general:       { icon: '🛡️', color: '#1D9E75', bg: 'rgba(29,158,117,0.12)' },
};

function getThreatConfig(focus: string) {
  const k = focus.toLowerCase();
  for (const [key, val] of Object.entries(THREAT_CONFIG)) {
    if (k.includes(key)) return val;
  }
  return THREAT_CONFIG.general;
}

function enrollmentStatusLabel(e: CourseEnrollment): string {
  if (e.status === 'certificate_issued' || e.certificate_number) return 'Certified';
  if (e.status === 'completed') return 'Completed';
  if (e.status === 'in_progress') return 'In Progress';
  return 'Enrolled';
}

function normalizeDifficulty(d: Course['difficulty'] | number): Course['difficulty'] {
  const n = Number(d);
  if (n === 1 || n === 2 || n === 3 || n === 4) return n;
  return 1;
}

function enrollmentMapFromList(enrollments: CourseEnrollment[]): Map<string, CourseEnrollment> {
  const map = new Map<string, CourseEnrollment>();
  for (const en of enrollments) {
    const courseId = en.course?.id;
    if (courseId) map.set(courseId, en);
  }
  return map;
}

// ─── Component ───────────────────────────────────────────────────────────────
const CoursesPage: React.FC = () => {
  const navigate = useNavigate();

  const [courses, setCourses] = useState<Course[]>([]);
  const [enrollmentByCourseId, setEnrollmentByCourseId] = useState<Map<string, CourseEnrollment>>(
    () => new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState('');
  const [enrollingId, setEnrollingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      try {
        const coursesData = await getCourses();
        const published = coursesData.filter(c => c.is_published);

        if (!cancelled) {
          setCourses(published);
          setLoading(false);
        }

        try {
          const enrollments = await getMyEnrollments();
          if (!cancelled) {
            setEnrollmentByCourseId(enrollmentMapFromList(enrollments));
          }
        } catch (enrollmentErr) {
          console.warn('Failed to load course enrollments', enrollmentErr);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          showToast({ type: 'error', message: 'Failed to load courses. Please try again.' });
          setLoading(false);
        }
      }
    };

    void loadData();
    return () => { cancelled = true; };
  }, []);

  const enrollmentMap = enrollmentByCourseId;

  const filteredCourses = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return courses.filter(course => {
      const matchesSearch = !q || 
        course.title.toLowerCase().includes(q) || 
        course.threat_focus.toLowerCase().includes(q);
      
      const matchesDiff =
        filterDifficulty === '' ||
        normalizeDifficulty(course.difficulty) === Number(filterDifficulty);
      return matchesSearch && matchesDiff;
    });
  }, [courses, searchTerm, filterDifficulty]);

  const getPassedCount = (en: CourseEnrollment) =>
    en.module_progresses.filter(p => p.status === 'passed').length;

  const handleEnroll = async (courseId: string) => {
    try {
      setEnrollingId(courseId);
      await enrollInCourse(courseId);
      showToast({ type: 'success', message: 'Successfully enrolled!' });
      navigate(`/dashboard/courses/${courseId}`);
    } catch {
      showToast({ type: 'error', message: 'Failed to enroll. Please try again.' });
    } finally {
      setEnrollingId(null);
    }
  };

  if (loading) {
    return (
      <div className="dashboard-page loading">
        <PageLoader message="Loading courses…" />
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <div className="welcome-header">
        <div className="welcome-content">
          <h1 className="welcome-title">
            Course <span className="gradient-text">Library</span>
          </h1>
          <p className="welcome-subtitle">
            Structured learning paths with readings and simulations
          </p>
        </div>
        <div className="welcome-actions">
          <div className="filter-group" style={{ marginBottom: 0 }}>
            <input
              className="courses-search"
              type="search"
              placeholder="Search title or threat…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            <select
              className="filter-select"
              value={filterDifficulty}
              onChange={e => setFilterDifficulty(e.target.value)}
            >
              <option value="">All difficulties</option>
              <option value="1">Beginner</option>
              <option value="2">Intermediate</option>
              <option value="3">Advanced</option>
              <option value="4">Expert</option>
            </select>
          </div>
        </div>
      </div>

      <div className="courses-count">
        {filteredCourses.length} course{filteredCourses.length !== 1 ? 's' : ''}
      </div>

      <div className="simulations-grid">
        {filteredCourses.length === 0 ? (
          <div className="courses-empty">No courses match your filters.</div>
        ) : (
          filteredCourses.map((course, idx) => {
            const en = enrollmentMap.get(course.id);
            const enrolled = Boolean(en);
            const certified = en?.status === 'certificate_issued' || Boolean(en?.certificate_number);
            const total = course.modules?.length ?? course.module_count;
            const done = en ? getPassedCount(en) : 0;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            const tc = getThreatConfig(course.threat_focus);
            const difficulty = normalizeDifficulty(course.difficulty);
            const diffClass = difficultyBadgeClass(difficulty);

            const statusChipClass =
              certified
                ? 'course-status-chip course-status-chip--certified'
                : en?.status === 'in_progress'
                  ? 'course-status-chip course-status-chip--progress'
                  : 'course-status-chip';

            return (
              <article
                key={course.id}
                className="course-card"
                style={{ animationDelay: `${idx * 40}ms` }}
              >
                <div className="course-card-thumb" style={{ background: tc.bg }}>
                  {course.thumbnail ? (
                    <img
                      src={course.thumbnail}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span className="course-thumb-icon">{tc.icon}</span>
                  )}

                  <span
                    className="course-thumb-label"
                    style={{ color: tc.color, background: tc.bg, borderColor: `${tc.color}40` }}
                  >
                    {course.threat_focus}
                  </span>

                  {certified && <span className="course-certified-ribbon">✦ Certified</span>}
                </div>

                <div className="course-card-body">
                  <h2 className="course-card-title">{course.title}</h2>

                  <div className="course-badges-row">
                    <span className={`difficulty-badge ${diffClass}`}>
                      {DIFFICULTY_LABELS[difficulty]}
                    </span>
                    <div className="course-meta">
                      <span className="course-meta-item">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        {course.estimated_hours}h
                      </span>
                      <span className="course-meta-item">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                        {course.module_count} modules
                      </span>
                    </div>
                  </div>

                  {enrolled && en && (
                    <>
                      <div className="course-prog-section">
                        <div className="course-prog-row">
                          <span>Progress</span>
                          <span>{done}/{total} modules</span>
                        </div>
                        <div className="course-prog-track">
                          <div className="course-prog-fill" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <div>
                        <span className={statusChipClass}>
                          <span className="course-status-dot" />
                          {enrollmentStatusLabel(en)}
                        </span>
                      </div>
                    </>
                  )}

                  {!enrolled && (
                    <span className="course-status-chip">
                      <span className="course-status-dot" />
                      Not enrolled
                    </span>
                  )}

                  <div className="course-actions">
                    {!enrolled && (
                      <button
                        type="button"
                        className="start-button"
                        disabled={enrollingId === course.id}
                        onClick={() => handleEnroll(course.id)}
                      >
                        {enrollingId === course.id ? 'Enrolling…' : '→ Enroll'}
                      </button>
                    )}
                    {enrolled && !certified && (
                      <button
                        type="button"
                        className="start-button"
                        onClick={() => navigate(`/dashboard/courses/${course.id}`)}
                      >
                        → Continue
                      </button>
                    )}
                    {certified && (
                      <button
                        type="button"
                        className="review-button"
                        onClick={() => navigate('/dashboard/certifications')}
                      >
                        ✦ View Certificate
                      </button>
                    )}
                    {enrolled && (
                      <button
                        type="button"
                        className="courses-btn-ghost"
                        onClick={() => navigate(`/dashboard/courses/${course.id}`)}
                      >
                        Details
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
};

export default CoursesPage;