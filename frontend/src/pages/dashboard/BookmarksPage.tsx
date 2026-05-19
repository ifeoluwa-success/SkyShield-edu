import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Bookmark, Trash2 } from 'lucide-react';
import MaterialCard from '../../components/content/MaterialCard';
import Toast from '../../components/Toast';
import { PageLoader } from '../../components/ui/Loading';
import {
  bookmarkContentMaterial,
  clearBookmarks,
  getBookmarks,
  type ContentMaterial,
} from '../../services/contentService';
import '../../assets/css/LearningMaterialsPage.css';

const BookmarksPage: React.FC = () => {
  const [materials, setMaterials] = useState<ContentMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [bookmarkingSlug, setBookmarkingSlug] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await getBookmarks();
      setMaterials(rows.map((b) => ({ ...b.material, is_bookmarked: true })));
    } catch {
      setToast({ type: 'error', message: 'Failed to load bookmarks' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleBookmark = async (slug: string) => {
    setBookmarkingSlug(slug);
    try {
      const res = await bookmarkContentMaterial(slug);
      if (!res.bookmarked) {
        setMaterials((prev) => prev.filter((m) => m.slug !== slug));
      }
      setToast({
        type: 'success',
        message: res.bookmarked ? 'Bookmarked' : 'Removed from saved references',
      });
    } catch {
      setToast({ type: 'error', message: 'Failed to update bookmark' });
    } finally {
      setBookmarkingSlug(null);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('Remove all saved references?')) return;
    try {
      await clearBookmarks();
      setMaterials([]);
      setToast({ type: 'success', message: 'All bookmarks cleared' });
    } catch {
      setToast({ type: 'error', message: 'Failed to clear bookmarks' });
    }
  };

  return (
    <div className="learning-materials-page">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <Link to="/dashboard/learning-materials" className="back-link">
        <ArrowLeft size={16} /> Operational library
      </Link>

      <div className="page-header page-header-row">
        <div>
          <h1 className="page-title">
            <Bookmark size={24} className="inline-icon" /> Saved references
          </h1>
          <p className="page-subtitle">Bookmarked operational materials for mission prep</p>
        </div>
        {materials.length > 0 && (
          <button type="button" className="clear-bookmarks-btn" onClick={handleClearAll}>
            <Trash2 size={16} /> Clear all
          </button>
        )}
      </div>

      {loading ? (
        <PageLoader message="Loading bookmarks…" className="min-h-0 py-12" />
      ) : materials.length === 0 ? (
        <div className="empty-state">
          <Bookmark size={48} />
          <p>No saved references yet. Bookmark materials from the library.</p>
          <Link to="/dashboard/learning-materials" className="path-enroll-btn">
            Browse library
          </Link>
        </div>
      ) : (
        <div className="materials-grid">
          {materials.map((m) => (
            <MaterialCard
              key={m.id}
              material={m}
              onBookmark={handleBookmark}
              bookmarking={bookmarkingSlug === m.slug}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default BookmarksPage;
