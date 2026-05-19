import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { isAxiosError } from 'axios';
import {
  ArrowLeft,
  Bookmark,
  Clock,
  ExternalLink,
  Heart,
  MessageSquare,
  Send,
  Star,
  Trash2,
} from 'lucide-react';
import ContentBody from '../../components/content/ContentBody';
import Toast from '../../components/Toast';
import { PageLoader } from '../../components/ui/Loading';
import { useAuth } from '../../hooks/useAuth';
import {
  bookmarkContentMaterial,
  createMaterialComment,
  deleteMaterialComment,
  getContentMaterial,
  getMaterialComments,
  likeMaterial,
  rateMaterial,
  resolveContentMediaUrl,
  updateMaterialProgress,
  type ContentComment,
  type ContentMaterial,
} from '../../services/contentService';
import '../../assets/css/LearningMaterialsPage.css';

function isAbortError(err: unknown): boolean {
  return isAxiosError(err) && (err.code === 'ERR_CANCELED' || err.message === 'canceled');
}

const MaterialDetailPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const [material, setMaterial] = useState<ContentMaterial | null>(null);
  const [comments, setComments] = useState<ContentComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [commentText, setCommentText] = useState('');
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!slug) return;

    const controller = new AbortController();
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [mat, cmts] = await Promise.all([
          getContentMaterial(slug, { signal: controller.signal }),
          getMaterialComments(slug, { signal: controller.signal }).catch(() => []),
        ]);
        if (!active) return;
        setMaterial(mat);
        setComments(cmts.length ? cmts : mat.comments ?? []);
        setRating(mat.user_rating ?? 0);
      } catch (err) {
        if (!active || isAbortError(err)) return;
        setError('Reference material not found or unavailable.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [slug]);

  const handleBookmark = async () => {
    if (!slug || !material) return;
    try {
      const res = await bookmarkContentMaterial(slug);
      setMaterial({ ...material, is_bookmarked: res.bookmarked });
      setToast({ type: 'success', message: res.bookmarked ? 'Saved to bookmarks' : 'Removed from bookmarks' });
    } catch {
      setToast({ type: 'error', message: 'Could not update bookmark' });
    }
  };

  const handleLike = async () => {
    if (!slug || !material) return;
    try {
      const res = await likeMaterial(slug);
      setMaterial({ ...material, is_liked: res.liked, likes_count: res.likes_count });
    } catch {
      setToast({ type: 'error', message: 'Could not update like' });
    }
  };

  const handleRate = async () => {
    if (!slug || !material || rating < 1) return;
    setSubmitting(true);
    try {
      await rateMaterial(slug, { rating, review: review || undefined });
      const updated = await getContentMaterial(slug);
      setMaterial(updated);
      setToast({ type: 'success', message: 'Rating submitted' });
    } catch {
      setToast({ type: 'error', message: 'Could not submit rating' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkComplete = async () => {
    if (!slug || !material) return;
    setSubmitting(true);
    try {
      await updateMaterialProgress(slug, { completed: true });
      const updated = await getContentMaterial(slug);
      setMaterial(updated);
      setToast({ type: 'success', message: 'Marked as reviewed' });
    } catch {
      setToast({ type: 'error', message: 'Could not update progress' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug || !commentText.trim()) return;
    setSubmitting(true);
    try {
      const c = await createMaterialComment(slug, { content: commentText.trim() });
      setComments((prev) => [c, ...prev]);
      setCommentText('');
    } catch {
      setToast({ type: 'error', message: 'Could not post comment' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!slug) return;
    try {
      await deleteMaterialComment(slug, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch {
      setToast({ type: 'error', message: 'Could not delete comment' });
    }
  };

  if (loading) {
    return (
      <div className="learning-materials-page loading">
        <PageLoader message="Loading briefing…" className="min-h-0 py-12" />
      </div>
    );
  }

  if (error || !material) {
    return (
      <div className="learning-materials-page">
        <Link to="/dashboard/learning-materials" className="back-link">
          <ArrowLeft size={16} /> Back to library
        </Link>
        <div className="empty-state">
          <p>{error ?? 'Material not found'}</p>
        </div>
      </div>
    );
  }

  const fileUrl = resolveContentMediaUrl(material.file);
  const videoUrl = material.video_url;
  const externalUrl = material.external_url;
  const completed = material.user_progress?.completed;

  return (
    <div className="learning-materials-page material-detail-page">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <Link to="/dashboard/learning-materials" className="back-link">
        <ArrowLeft size={16} /> Operational library
      </Link>

      <header className="detail-header">
        <div className="detail-header-main">
          <span className="material-type-badge">{material.material_type}</span>
          <span className={`difficulty-pill ${material.difficulty}`}>{material.difficulty}</span>
          <h1 className="page-title">{material.title}</h1>
          <p className="page-subtitle">{material.description}</p>
          <div className="detail-meta-row">
            {material.estimated_read_time ? (
              <span><Clock size={14} /> {material.estimated_read_time} min read</span>
            ) : null}
            {material.views_count != null ? <span>{material.views_count} views</span> : null}
            {material.likes_count != null ? <span>{material.likes_count} likes</span> : null}
            {material.average_rating != null && material.average_rating > 0 ? (
              <span>★ {material.average_rating.toFixed(1)}</span>
            ) : null}
          </div>
        </div>
        <div className="detail-actions">
          <button type="button" className={`icon-action-btn ${material.is_bookmarked ? 'active' : ''}`} onClick={handleBookmark}>
            <Bookmark size={18} fill={material.is_bookmarked ? 'currentColor' : 'none'} />
          </button>
          <button type="button" className={`icon-action-btn ${material.is_liked ? 'active' : ''}`} onClick={handleLike}>
            <Heart size={18} fill={material.is_liked ? 'currentColor' : 'none'} />
          </button>
          {!completed ? (
            <button type="button" className="path-enroll-btn" disabled={submitting} onClick={handleMarkComplete}>
              Mark reviewed
            </button>
          ) : (
            <span className="completed-badge">Reviewed</span>
          )}
        </div>
      </header>

      {(fileUrl || videoUrl || externalUrl) && (
        <div className="detail-resources">
          {videoUrl && (
            <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="resource-link">
              <ExternalLink size={16} /> Watch briefing video
            </a>
          )}
          {fileUrl && (
            <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="resource-link">
              <ExternalLink size={16} /> Download reference file
            </a>
          )}
          {externalUrl && (
            <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="resource-link">
              <ExternalLink size={16} /> External reference
            </a>
          )}
        </div>
      )}

      {material.content && (
        <section className="detail-content-section">
          <h2 className="section-title">Briefing content</h2>
          <ContentBody content={material.content} />
        </section>
      )}

      <section className="detail-rating-section">
        <h2 className="section-title">Rate this reference</h2>
        <div className="rating-stars">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" className={`star-btn ${rating >= n ? 'active' : ''}`} onClick={() => setRating(n)}>
              <Star size={22} fill={rating >= n ? 'currentColor' : 'none'} />
            </button>
          ))}
        </div>
        <textarea
          className="rating-review-input"
          placeholder="Optional field notes…"
          value={review}
          onChange={(e) => setReview(e.target.value)}
          rows={2}
        />
        <br />
        <button type="button" className="path-enroll-btn" disabled={submitting || rating < 1} onClick={handleRate}>
          Submit rating
        </button>
      </section>

      <section className="detail-comments-section">
        <h2 className="section-title">
          <MessageSquare size={18} /> Field notes ({comments.length})
        </h2>
        {user && (
          <form className="comment-form" onSubmit={handleComment}>
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add operational notes…"
              rows={3}
              required
            />
            <button type="submit" className="path-enroll-btn" disabled={submitting || !commentText.trim()}>
              <Send size={16} /> Post
            </button>
          </form>
        )}
        <ul className="comments-list">
          {comments.map((c) => (
            <li key={c.id} className="comment-item">
              <div className="comment-header">
                <strong>{c.user_details?.full_name ?? 'Operator'}</strong>
                <span className="comment-date">{new Date(c.created_at).toLocaleDateString()}</span>
                {user?.id === c.user && (
                  <button type="button" className="comment-delete" onClick={() => handleDeleteComment(c.id)}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <p>{c.content}</p>
            </li>
          ))}
          {comments.length === 0 && <p className="empty-comments">No field notes yet.</p>}
        </ul>
      </section>

      {material.related_materials && material.related_materials.length > 0 && (
        <section className="related-section">
          <h2 className="section-title">Related references</h2>
          <ul className="related-list">
            {material.related_materials.map((r) => (
              <li key={r.id}>
                <Link to={`/dashboard/learning-materials/${r.slug}`}>{r.title}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};

export default MaterialDetailPage;