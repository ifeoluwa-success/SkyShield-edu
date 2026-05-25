import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { ArrowLeft, BookOpen, CheckCircle, ChevronRight, Clock, Circle } from 'lucide-react';
import { showToast } from '../../lib/toast';
import { PageLoader } from '../../components/ui/Loading';
import { queryKeys } from '../../lib/queryClient';
import {
  completePathMaterial,
  enrollInLearningPath,
  getLearningPath,
  pathProgressPercent,
  type ContentMaterial,
  type LearningPath,
} from '../../services/contentService';
import '../../assets/css/LearningMaterialsPage.css';

function pathErrorMessage(err: unknown): string {
  if (isAxiosError(err)) {
    if (err.response?.status === 404) return 'Learning path not found.';
    if (err.response?.status === 401) return 'Your session expired. Please sign in again.';
  }
  if (err instanceof Error && err.message === 'Invalid path slug') {
    return 'Invalid learning path link.';
  }
  return 'Could not load this learning path. Please try again.';
}

const LearningPathDetailPage: React.FC = () => {
  const { slug: rawSlug } = useParams<{ slug: string }>();
  const slug = rawSlug?.trim();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [completingId, setCompletingId] = useState<string | null>(null);

  const slugValid = !!slug && slug !== 'undefined' && slug !== 'null';

  const pathQuery = useQuery({
    queryKey: queryKeys.content.path(slug ?? ''),
    queryFn: () => getLearningPath(slug!),
    enabled: slugValid,
    retry: (count, err) => {
      if (isAxiosError(err) && err.response?.status === 404) return false;
      return count < 1;
    },
  });

  const path = pathQuery.data ?? null;
  const loading = pathQuery.isLoading;
  const error = pathQuery.isError ? pathErrorMessage(pathQuery.error) : !slugValid ? 'Invalid learning path link.' : null;

  const updatePathCache = (patch: Partial<LearningPath>) => {
    if (!slug) return;
    queryClient.setQueryData(queryKeys.content.path(slug), (prev: LearningPath | undefined) =>
      prev ? { ...prev, ...patch } : prev,
    );
  };

  const handleEnroll = async () => {
    if (!slug) return;
    try {
      await enrollInLearningPath(slug);
      showToast({ type: 'success', message: 'Enrolled in mission path' });
      await pathQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: queryKeys.content.paths });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Enrollment failed';
      showToast({ type: 'error', message: msg });
    }
  };

  const handleCompleteMaterial = async (material: ContentMaterial) => {
    if (!slug || !path) return;
    const completedIds = new Set(
      path.user_enrollment?.completed_materials ?? path.user_progress?.completed_materials ?? [],
    );
    if (completedIds.has(material.id)) return;

    setCompletingId(material.id);
    try {
      const res = await completePathMaterial(slug, material.id);
      const enrollment = {
        status: res.status,
        progress: res.progress,
        completed_materials: res.completed_materials,
      };
      updatePathCache({
        user_enrolled: true,
        user_enrollment: enrollment,
        user_progress: enrollment,
      });
      showToast({ type: 'success', message: `Completed: ${material.title}` });
    } catch {
      showToast({ type: 'error', message: 'Could not mark material complete' });
    } finally {
      setCompletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="learning-materials-page loading">
        <PageLoader message="Loading path…" className="min-h-0 py-12" />
      </div>
    );
  }

  if (error || !path) {
    return (
      <div className="learning-materials-page">
        <Link to="/dashboard/learning-materials" className="back-link">
          <ArrowLeft size={16} /> Back to library
        </Link>
        <div className="empty-state">
          <p>{error ?? 'Path not found'}</p>
          <Link to="/dashboard/learning-materials" className="path-enroll-btn">
            Return to library
          </Link>
        </div>
      </div>
    );
  }

  const progress = pathProgressPercent(path);
  const enrolled = path.user_enrolled ?? !!path.user_enrollment;
  const materials = path.materials ?? [];
  const completedIds = new Set(
    path.user_enrollment?.completed_materials ?? path.user_progress?.completed_materials ?? [],
  );

  return (
    <div className="learning-materials-page path-detail-page">
<Link to="/dashboard/learning-materials" className="back-link">
        <ArrowLeft size={16} /> Operational library
      </Link>

      <header className="detail-header">
        {path.difficulty && (
          <span className={`difficulty-pill ${path.difficulty}`}>{path.difficulty}</span>
        )}
        <h1 className="page-title">{path.title}</h1>
        <p className="page-subtitle">{path.description}</p>
        <div className="path-meta">
          <span>
            <BookOpen size={13} /> {path.material_count ?? materials.length} references
          </span>
          {path.estimated_duration != null && (
            <span>
              <Clock size={13} /> {path.estimated_duration} min total
            </span>
          )}
        </div>
        {enrolled && progress > 0 && (
          <div className="path-progress-track path-progress-track-lg">
            <div className="path-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        )}
        {!enrolled ? (
          <button type="button" className="path-enroll-btn" onClick={handleEnroll}>
            Enroll in path <ChevronRight size={14} />
          </button>
        ) : (
          <p className="enrolled-label">Enrolled · {Math.round(progress)}% complete</p>
        )}
      </header>

      <section className="path-curriculum">
        <h2 className="section-title">Path checklist</h2>
        {materials.length === 0 ? (
          <p className="empty-state-inline">No materials in this path yet.</p>
        ) : (
          <ul className="path-checklist">
            {materials.map((m) => {
              const done = completedIds.has(m.id);
              return (
                <li key={m.id} className={`checklist-item ${done ? 'done' : ''}`}>
                  <div className="checklist-status">
                    {done ? <CheckCircle size={20} className="check-done" /> : <Circle size={20} />}
                  </div>
                  <div className="checklist-body">
                    <Link to={`/dashboard/learning-materials/${m.slug}`} className="checklist-title">
                      {m.title}
                    </Link>
                    <span className="material-type-badge">{m.material_type}</span>
                  </div>
                  <div className="checklist-actions">
                    <button
                      type="button"
                      className="view-btn"
                      onClick={() => navigate(`/dashboard/learning-materials/${m.slug}`)}
                    >
                      Open
                    </button>
                    {enrolled && !done && (
                      <button
                        type="button"
                        className="path-enroll-btn checklist-complete-btn"
                        disabled={completingId === m.id}
                        onClick={() => handleCompleteMaterial(m)}
                      >
                        Mark done
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};

export default LearningPathDetailPage;
