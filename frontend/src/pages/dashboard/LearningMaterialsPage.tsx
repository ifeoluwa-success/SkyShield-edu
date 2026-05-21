import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  Clock,
  Search,
  X,
  Bookmark,
  ChevronRight,
  Video,
  FileText,
  ExternalLink,
  Users,
  Layers,
  Star,
} from 'lucide-react';
import {
  getContentMaterials,
  getCategories,
  getLearningPaths,
  getAnnouncements,
  bookmarkContentMaterial,
  enrollInLearningPath,
  learningPathDetailRoute,
  markAnnouncementRead,
  pathProgressPercent,
  type ContentMaterial,
  type LearningPath,
  type Announcement,
} from '../../services/contentService';
import { queryKeys } from '../../lib/queryClient';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useContentLibraryBase } from '../../hooks/usePortalBasePath';
import Toast from '../../components/Toast';
import { ContentGridSkeleton } from '../../components/ui/ContentGridSkeleton';
import '../../assets/css/LearningMaterialsPage.css';

/* ─── helpers ─── */

function getMaterialIcon(type: string) {
  if (type === 'video') return <Video size={20} />;
  if (type === 'document' || type === 'ebook') return <FileText size={20} />;
  return <BookOpen size={20} />;
}

function DifficultyPill({ level }: { level: string }) {
  const key = level in { beginner: 1, intermediate: 1, advanced: 1, expert: 1 } ? level : 'beginner';
  return <span className={`difficulty-pill ${key}`}>{level}</span>;
}

function announcementPriorityClass(priority: string) {
  if (priority === 'urgent' || priority === 'high' || priority === 'medium' || priority === 'low') {
    return `priority-${priority}`;
  }
  return 'priority-low';
}

/* ─── Path card ─── */

function PathCard({
  path,
  onEnroll,
}: {
  path: LearningPath;
  onEnroll: (p: LearningPath) => void;
}) {
  const libraryBase = useContentLibraryBase();
  const progress = pathProgressPercent(path);
  const enrolled = path.user_enrolled ?? false;
  const pathHref = path.slug
    ? libraryBase.startsWith('/dashboard')
      ? learningPathDetailRoute(path.slug)
      : libraryBase
    : libraryBase;

  return (
    <div className="path-card p-4 rounded-lg shadow-md">
      <div className="path-header">
        <h3 className="path-title">
          <Link to={pathHref}>
            {path.title}
          </Link>
        </h3>
        {path.difficulty && <DifficultyPill level={path.difficulty} />}
      </div>

      {path.description && <p className="path-desc">{path.description}</p>}

      <div className="path-meta text-sm flex items-center gap-2">
        {path.material_count != null && (
          <span className="flex items-center gap-1">
            <Layers size={13} /> {path.material_count} materials
          </span>
        )}
        {path.estimated_duration != null && (
          <span className="flex items-center gap-1">
            <Clock size={13} /> {path.estimated_duration} min
          </span>
        )}
        {path.enrolled_count != null && (
          <span className="flex items-center gap-1">
            <Users size={13} /> {path.enrolled_count.toLocaleString()}
          </span>
        )}
      </div>

      {enrolled && progress > 0 && (
        <div className="path-progress-track">
          <div className="path-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}

      <button
        type="button"
        onClick={() => onEnroll(path)}
        className={`path-enroll-btn${enrolled ? ' secondary' : ''}`}
      >
        {enrolled ? 'Continue path' : 'Enroll'}
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

/* ─── Material card ─── */

function MaterialCard({
  material,
  onBookmark,
  bookmarking,
}: {
  material: ContentMaterial;
  onBookmark: (slug: string) => void;
  bookmarking: boolean;
}) {
  const libraryBase = useContentLibraryBase();
  const detailPath = `${libraryBase}/${material.slug}`;
  const href = material.file ?? material.video_url ?? material.external_url ?? null;
  const hasContent = !href && !!material.content;
  const bookmarked = material.is_bookmarked ?? false;

  return (
    <div className="material-card p-4 rounded-lg shadow-md transition-all duration-300 hover:shadow-lg hover:border-cyan-dark flex flex-col gap-2">
      <div className="material-card-head flex items-center justify-between gap-2">
        <div className="material-icon">{getMaterialIcon(material.material_type)}</div>
        <div className="material-meta-badges">
          <span className="material-type-badge">{material.material_type}</span>
          {material.difficulty && <DifficultyPill level={material.difficulty} />}
        </div>
      </div>

      <div className="material-info flex flex-col gap-2 py-4">
        {hasContent ? (
          <Link to={detailPath} className="material-title-link">
            <h3 className="text-lg font-semibold">{material.title}</h3>
          </Link>
        ) : (
          <h3 className="text-lg font-semibold">{material.title}</h3>
        )}
        {material.description && <p className="text-sm text-gray-600 py-4">{material.description}</p>}
        <div className="material-meta text-sm flex items-center gap-2">
          {material.estimated_read_time != null && (
            <span className="material-time flex items-center gap-1">
              <Clock size={12} className="inline-block" /> {material.estimated_read_time} min
            </span>
          )}
          {material.average_rating != null && (
            <span className="material-rating flex items-center gap-1">
              <Star size={12} className="inline-block" /> {Number(material.average_rating).toFixed(1)}
            </span>
          )}
          {material.category_name && (
            <>
              <span className="meta-dot inline-block w-1 h-1 rounded-full bg-gray-400" aria-hidden />
              <span className="material-category text-sm text-gray-600">{material.category_name}</span>
            </>
          )}
        </div>
      </div>

      <div className="material-actions flex items-center gap-2 mt-4">
        <button
          type="button"
          disabled={bookmarking}
          onClick={() => onBookmark(material.slug)}
          aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark'}
          className={`bookmark-btn${bookmarked ? ' active' : ''}`}
        >
          <Bookmark size={16} fill={bookmarked ? 'currentColor' : 'none'} />
        </button>

        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="view-btn flex items-center gap-1">
            <ExternalLink size={14} /> View
          </a>
        ) : hasContent ? (
          <Link to={detailPath} className="view-btn">
            Read <ChevronRight size={14} />
          </Link>
        ) : (
          <button type="button" disabled className="view-btn disabled">
            Preview unavailable
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Page ─── */

const LearningMaterialsPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const libraryBase = useContentLibraryBase();
  const isTraineeLibrary = libraryBase.startsWith('/dashboard');
  const [toast, setToast] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);
  const [bookmarkingSlug, setBookmarkingSlug] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState('');

  const debouncedSearch = useDebouncedValue(searchTerm, 300);

  const materialFilters = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      category: selectedCategory || undefined,
      difficulty: selectedDifficulty || undefined,
    }),
    [debouncedSearch, selectedCategory, selectedDifficulty],
  );

  const categoriesQuery = useQuery({
    queryKey: queryKeys.content.categories,
    queryFn: getCategories,
    staleTime: 5 * 60_000,
  });

  const pathsQuery = useQuery({
    queryKey: queryKeys.content.paths,
    queryFn: getLearningPaths,
    staleTime: 60_000,
  });

  const announcementsQuery = useQuery({
    queryKey: queryKeys.content.announcements,
    queryFn: getAnnouncements,
    staleTime: 60_000,
    select: (data) => data.filter((a: Announcement) => !a.is_read),
  });

  const materialsQuery = useQuery({
    queryKey: queryKeys.content.materials(materialFilters),
    queryFn: () => getContentMaterials(materialFilters),
    placeholderData: (prev) => prev,
  });

  const bookmarkMutation = useMutation({
    mutationFn: bookmarkContentMaterial,
    onSuccess: (res, slug) => {
      queryClient.setQueryData(
        queryKeys.content.materials(materialFilters),
        (old: typeof materialsQuery.data) =>
          old?.map((m) => (m.slug === slug ? { ...m, is_bookmarked: res.bookmarked } : m)),
      );
      setToast({
        type: 'success',
        message: res.bookmarked ? 'Saved to bookmarks' : 'Removed from bookmarks',
      });
    },
    onError: () => setToast({ type: 'error', message: 'Failed to bookmark material' }),
  });

  const handleBookmark = (slug: string) => {
    setBookmarkingSlug(slug);
    bookmarkMutation.mutate(slug, { onSettled: () => setBookmarkingSlug(null) });
  };

  const handleEnroll = async (path: LearningPath) => {
    if (!path.slug) {
      setToast({ type: 'error', message: 'This path is missing a link identifier.' });
      return;
    }
    if (path.user_enrolled) {
      navigate(learningPathDetailRoute(path.slug));
      return;
    }
    try {
      await enrollInLearningPath(path.slug);
      setToast({ type: 'success', message: 'Enrolled in path' });
      void queryClient.invalidateQueries({ queryKey: queryKeys.content.paths });
      navigate(learningPathDetailRoute(path.slug));
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to enroll';
      setToast({ type: 'error', message: msg });
    }
  };

  const dismissAnnouncement = async (a: Announcement) => {
    queryClient.setQueryData(
      queryKeys.content.announcements,
      (old: Announcement[] | undefined) => old?.filter((x) => x.id !== a.id),
    );
    try {
      await markAnnouncementRead(a.id);
    } catch {
      /* local dismiss ok */
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim().length >= 2) {
      navigate(`/dashboard/search?q=${encodeURIComponent(searchTerm.trim())}`);
    }
  };

  const categories = categoriesQuery.data ?? [];
  const paths = pathsQuery.data ?? [];
  const announcements = announcementsQuery.data ?? [];
  const materials = materialsQuery.data ?? [];
  const initialLoading = materialsQuery.isLoading && !materialsQuery.data;
  const isRefetching = materialsQuery.isFetching && !initialLoading;

  if (initialLoading && categoriesQuery.isLoading) {
    return (
      <div className="learning-materials-page">
        <ContentGridSkeleton />
      </div>
    );
  }

  return (
    <div className="learning-materials-page">
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      {announcements.length > 0 && (
        <section className="announcements-section">
          {announcements.map((a) => (
            <div
              key={a.id}
              className={`announcement-body ${announcementPriorityClass(a.priority)}`}
            >
              <div>
                <span className="announcement-title">{a.title}</span>
                <span>{a.content}</span>
              </div>
              <button
                type="button"
                onClick={() => dismissAnnouncement(a)}
                aria-label="Dismiss"
                className="announcement-dismiss"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </section>
      )}

      <div className="page-header page-header-row">
        <div>
          <h1 className="page-title">Learning Materials</h1>
          <p className="page-subtitle">
            Access documents, videos, and resources to build your cybersecurity skills.
          </p>
        </div>
        {isTraineeLibrary ? (
          <Link to="/dashboard/bookmarks" className="bookmarks-link">
            <Bookmark size={16} /> Saved
          </Link>
        ) : null}
      </div>

      {paths.length > 0 && (
        <section className="learning-paths-section py-4">
          <h2 className="section-title">Learning Paths</h2>
          <div className="paths-grid">
            {paths.map((path) => (
              <PathCard key={path.id} path={path} onEnroll={handleEnroll} />
            ))}
          </div>
        </section>
      )}

      <form className="materials-toolbar" onSubmit={handleSearchSubmit}>
        <label className="search-box">
          <Search size={16} />
          <input
            type="search"
            placeholder="Search materials…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              type="button"
              className="clear-search"
              onClick={() => setSearchTerm('')}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </label>

        <select
          className="filter-select"
          value={selectedDifficulty}
          onChange={(e) => setSelectedDifficulty(e.target.value)}
        >
          <option value="">All levels</option>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
          <option value="expert">Expert</option>
        </select>
      </form>

      {categories.length > 0 && (
        <div className="category-chips">
          <button
            type="button"
            className={selectedCategory === '' ? 'active' : ''}
            onClick={() => setSelectedCategory('')}
          >
            All
          </button>
          {categories
            .filter((c) => c.is_active)
            .map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={selectedCategory === cat.slug ? 'active' : ''}
                onClick={() =>
                  setSelectedCategory(selectedCategory === cat.slug ? '' : cat.slug)
                }
              >
                {cat.name}
              </button>
            ))}
        </div>
      )}

      {isRefetching && <p className="filtering-hint">Updating…</p>}

      {initialLoading ? (
        <ContentGridSkeleton />
      ) : materials.length === 0 ? (
        <div className="empty-state">
          <BookOpen size={48} />
          <p>No materials found — try adjusting your filters.</p>
        </div>
      ) : (
        <div className="materials-grid">
          {materials.map((material) => (
            <MaterialCard
              key={material.id}
              material={material}
              onBookmark={handleBookmark}
              bookmarking={bookmarkingSlug === material.slug}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default LearningMaterialsPage;
