import axios, { isAxiosError } from 'axios';
import api from './api';

const API_BASE = import.meta.env.VITE_API_URL ?? 'https://skyshield-backend.onrender.com/api';

/** AllowAny content reads: retry without JWT when an invalid token would otherwise 401. */
async function getWithAuthPublicFallback<T>(path: string): Promise<T> {
  try {
    const res = await api.get<T>(path);
    return res.data;
  } catch (err) {
    if (isAxiosError(err) && err.response?.status === 401) {
      const res = await axios.get<T>(`${API_BASE}${path}`, { timeout: 15000 });
      return res.data;
    }
    throw err;
  }
}

function encodeSlug(slug: string): string {
  return encodeURIComponent(slug.trim());
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ContentCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon?: string;
  parent?: string | null;
  is_active: boolean;
}

export interface UserProgress {
  completed: boolean;
  percentage: number;
  started_at?: string;
  completed_at?: string;
}

export interface ContentMaterial {
  id: string;
  title: string;
  slug: string;
  description: string;
  content?: string;
  material_type: string;
  difficulty: string;
  tags: string[];
  file?: string;
  video_url?: string;
  external_url?: string;
  estimated_read_time?: number;
  is_published?: boolean;
  is_featured?: boolean;
  views_count?: number;
  likes_count?: number;
  average_rating?: number;
  ratings_count?: number;
  created_at: string;
  category?: string;
  category_name?: string;
  author_name?: string;
  is_bookmarked?: boolean;
  is_liked?: boolean;
  user_rating?: number | null;
  user_progress?: UserProgress | null;
  related_materials?: ContentMaterial[];
  comments?: ContentComment[];
}

export interface PathUserProgress {
  status: string;
  progress: number;
  completed_materials: string[];
}

export interface PathEnrollment {
  status: string;
  progress: number;
  completed_materials: string[];
  started_at?: string;
  completed_at?: string;
  last_accessed?: string;
}

export interface LearningPath {
  id: string;
  title: string;
  slug: string;
  description: string;
  difficulty: string;
  estimated_duration?: number;
  material_count?: number;
  enrolled_count?: number;
  user_enrolled?: boolean;
  user_progress?: PathUserProgress | null;
  materials?: ContentMaterial[];
  user_enrollment?: PathEnrollment | null;
  created_at: string;
}

export interface GlossaryTerm {
  id: string;
  term: string;
  definition: string;
  category?: string;
}

export interface FAQ {
  id: string;
  question: string;
  answer: string;
  category?: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  target_roles?: string[];
  is_active?: boolean;
  is_read?: boolean;
  publish_from?: string;
  publish_until?: string | null;
  created_at: string;
  updated_at?: string;
  created_by_name?: string;
}

export type AnnouncementPayload = {
  title: string;
  content: string;
  priority: Announcement['priority'];
  target_roles?: string[];
  publish_from?: string;
  publish_until?: string | null;
  is_active?: boolean;
};

export interface MeetingInvitation {
  id: string;
  meeting: {
    id: string;
    title: string;
    meeting_code: string;
    scheduled_start: string;
    scheduled_end: string;
    host_name?: string;
  };
  inviter_name?: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
}

export interface CommentUserDetails {
  id: string;
  email: string;
  username: string;
  full_name: string;
  profile_picture?: string | null;
  role?: string;
}

export interface ContentComment {
  id: string;
  user: string;
  user_details: CommentUserDetails;
  material: string;
  content: string;
  parent?: string | null;
  replies?: ContentComment[];
  created_at: string;
  updated_at: string;
}

export interface CreateContentCommentRequest {
  content: string;
}

export interface UpdateContentCommentRequest {
  content: string;
}

export interface ContentRating {
  id: string;
  user: string;
  material: string;
  rating: number;
  review?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateRatingRequest {
  rating: number;
  review?: string;
}

export interface MaterialBookmark {
  id: string;
  material: ContentMaterial;
  created_at: string;
}

export interface SearchResultItem {
  id: string;
  title: string;
  type: 'material' | 'path' | 'glossary' | 'faq';
  description: string;
  url: string;
  score: number;
  created_at?: string | null;
  author_name?: string | null;
}

export interface GroupedSearchResults {
  materials: SearchResultItem[];
  paths: SearchResultItem[];
  glossary: SearchResultItem[];
  faqs: SearchResultItem[];
  total: number;
}

export interface MaterialProgressResponse {
  id: string;
  completed: boolean;
  progress_percentage: number;
  started_at?: string;
  completed_at?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function unwrap<T>(data: T[] | { results: T[] }): T[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && 'results' in data) return data.results;
  return [];
}

const API_ORIGIN = (import.meta.env.VITE_API_URL ?? '').replace(/\/api\/?$/, '');

/** Resolve relative media URLs from the API. */
export function resolveContentMediaUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/') && API_ORIGIN) return `${API_ORIGIN}${url}`;
  return url;
}

export function searchItemToRoute(
  item: SearchResultItem,
  libraryBase = '/dashboard/learning-materials',
): string {
  const base = libraryBase.replace(/\/$/, '');
  const traineeLibrary = libraryBase.startsWith('/dashboard');

  switch (item.type) {
    case 'material': {
      const slug = slugFromSearchUrl(item.url, 'materials');
      return slug ? `${base}/${slug}` : base;
    }
    case 'path': {
      const slug = slugFromSearchUrl(item.url, 'paths');
      if (!slug) return base;
      return traineeLibrary ? learningPathDetailRoute(slug) : base;
    }
    case 'glossary':
    case 'faq':
      return traineeLibrary ? '/dashboard/help' : '/help';
    default:
      return base;
  }
}

/** Extract slug from API search url like `/content/materials/my-slug/`. */
export function slugFromSearchUrl(url: string, segment: 'materials' | 'paths'): string | null {
  const match = url.match(new RegExp(`/content/${segment}/([^/]+)/?`));
  return match?.[1] ?? null;
}

export function normalizeSearchResults(data: unknown): GroupedSearchResults {
  const empty: GroupedSearchResults = {
    materials: [],
    paths: [],
    glossary: [],
    faqs: [],
    total: 0,
  };
  if (!Array.isArray(data)) return empty;

  const items = data as SearchResultItem[];
  const materials = items.filter((i) => i.type === 'material');
  const paths = items.filter((i) => i.type === 'path');
  const glossary = items.filter((i) => i.type === 'glossary');
  const faqs = items.filter((i) => i.type === 'faq');

  return {
    materials,
    paths,
    glossary,
    faqs,
    total: items.length,
  };
}

export function pathProgressPercent(path: LearningPath): number {
  return path.user_progress?.progress ?? path.user_enrollment?.progress ?? 0;
}

// ── Categories ────────────────────────────────────────────────────────────────

export const getCategories = async (): Promise<ContentCategory[]> => {
  const res = await api.get<ContentCategory[] | { results: ContentCategory[] }>('/content/categories/');
  return unwrap(res.data);
};

// ── Materials ─────────────────────────────────────────────────────────────────

export const getContentMaterials = async (params?: {
  category?: string;
  type?: string;
  difficulty?: string;
  search?: string;
  featured?: boolean;
  sort?: string;
  page?: number;
}): Promise<ContentMaterial[]> => {
  const res = await api.get<ContentMaterial[] | { results: ContentMaterial[] }>(
    '/content/materials/',
    { params },
  );
  return unwrap(res.data);
};

export const getContentMaterial = async (
  slug: string,
  options?: { signal?: AbortSignal },
): Promise<ContentMaterial> => {
  const res = await api.get<ContentMaterial>(`/content/materials/${slug}/`, {
    signal: options?.signal,
  });
  return res.data;
};

export const bookmarkContentMaterial = async (slug: string): Promise<{ bookmarked: boolean }> => {
  const res = await api.post<{ bookmarked: boolean }>(`/content/materials/${slug}/bookmark/`);
  return res.data;
};

export const likeMaterial = async (
  slug: string,
): Promise<{ liked: boolean; likes_count: number }> => {
  const res = await api.post<{ liked: boolean; likes_count: number }>(
    `/content/materials/${slug}/like/`,
  );
  return res.data;
};

export const rateMaterial = async (
  slug: string,
  data: CreateRatingRequest,
): Promise<ContentRating> => {
  const res = await api.post<ContentRating>(`/content/materials/${slug}/rate/`, data);
  return res.data;
};

export const updateMaterialProgress = async (
  slug: string,
  data: { progress_percentage?: number; completed?: boolean },
): Promise<MaterialProgressResponse> => {
  const res = await api.post<MaterialProgressResponse>(`/content/materials/${slug}/progress/`, data);
  return res.data;
};

// ── Comments ──────────────────────────────────────────────────────────────────

export const getMaterialComments = async (
  slug: string,
  options?: { signal?: AbortSignal },
): Promise<ContentComment[]> => {
  const res = await api.get<ContentComment[] | { results: ContentComment[] }>(
    `/content/materials/${slug}/comments/`,
    { signal: options?.signal },
  );
  return unwrap(res.data);
};

export const createMaterialComment = async (
  slug: string,
  data: CreateContentCommentRequest,
): Promise<ContentComment> => {
  const res = await api.post<ContentComment>(`/content/materials/${slug}/comments/`, data);
  return res.data;
};

export const updateMaterialComment = async (
  slug: string,
  commentId: string,
  data: UpdateContentCommentRequest,
): Promise<ContentComment> => {
  const res = await api.patch<ContentComment>(
    `/content/materials/${slug}/comments/${commentId}/`,
    data,
  );
  return res.data;
};

export const deleteMaterialComment = async (slug: string, commentId: string): Promise<void> => {
  await api.delete(`/content/materials/${slug}/comments/${commentId}/`);
};

// ── Learning paths ────────────────────────────────────────────────────────────

export const getLearningPaths = async (): Promise<LearningPath[]> => {
  const data = await getWithAuthPublicFallback<LearningPath[] | { results: LearningPath[] }>(
    '/content/paths/',
  );
  return unwrap(data);
};

export const getLearningPath = async (slug: string): Promise<LearningPath> => {
  const safe = encodeSlug(slug);
  if (!safe || safe === 'undefined' || safe === 'null') {
    throw new Error('Invalid path slug');
  }
  return getWithAuthPublicFallback<LearningPath>(`/content/paths/${safe}/`);
};

export const learningPathDetailRoute = (slug: string): string =>
  `/dashboard/learning-paths/${encodeSlug(slug)}`;

export const enrollInLearningPath = async (slug: string): Promise<{ enrolled: boolean }> => {
  const res = await api.post<{ enrolled: boolean }>(`/content/paths/${encodeSlug(slug)}/enroll/`);
  return res.data;
};

export const completePathMaterial = async (
  pathSlug: string,
  materialId: string,
): Promise<{ status: string; progress: number; completed_materials: string[] }> => {
  const res = await api.post(`/content/paths/${encodeSlug(pathSlug)}/complete-material/`, {
    material_id: materialId,
  });
  return res.data;
};

// ── Bookmarks ─────────────────────────────────────────────────────────────────

export const getBookmarks = async (): Promise<MaterialBookmark[]> => {
  const res = await api.get<MaterialBookmark[] | { results: MaterialBookmark[] }>(
    '/content/bookmarks/',
  );
  return unwrap(res.data);
};

export const clearBookmarks = async (): Promise<void> => {
  await api.delete('/content/bookmarks/clear/');
};

// ── Glossary ──────────────────────────────────────────────────────────────────

export const getGlossaryTerms = async (search?: string): Promise<GlossaryTerm[]> => {
  const res = await api.get<GlossaryTerm[] | { results: GlossaryTerm[] }>(
    '/content/glossary/',
    { params: search ? { search } : undefined },
  );
  return unwrap(res.data);
};

export const searchGlossary = async (query: string): Promise<GlossaryTerm[]> => {
  const res = await api.get<GlossaryTerm[]>('/content/glossary/search/', { params: { q: query } });
  return res.data;
};

// ── FAQs ──────────────────────────────────────────────────────────────────────

export const getFAQs = async (params?: { category?: string; search?: string }): Promise<FAQ[]> => {
  const res = await api.get<FAQ[] | { results: FAQ[] }>('/content/faqs/', { params });
  return unwrap(res.data);
};

export const trackFAQView = async (faqId: string): Promise<void> => {
  await api.post(`/content/faqs/${faqId}/track-view/`);
};

// ── Announcements ─────────────────────────────────────────────────────────────

export const getAnnouncements = async (): Promise<Announcement[]> => {
  const res = await api.get<Announcement[] | { results: Announcement[] }>('/content/announcements/');
  return unwrap(res.data);
};

export const getUnreadAnnouncementsCount = async (): Promise<number> => {
  const res = await api.get<{ unread_count: number }>('/content/announcements/unread/');
  return res.data.unread_count ?? 0;
};

export const markAnnouncementRead = async (id: string): Promise<Announcement> => {
  const res = await api.get<Announcement>(`/content/announcements/${id}/`);
  return res.data;
};

export const listManageAnnouncements = async (): Promise<Announcement[]> => {
  const res = await api.get<Announcement[] | { results: Announcement[] }>(
    '/content/announcements/manage/',
  );
  return unwrap(res.data);
};

export const createAnnouncement = async (payload: AnnouncementPayload): Promise<Announcement> => {
  const res = await api.post<Announcement>('/content/announcements/manage/', payload);
  return res.data;
};

export const updateAnnouncement = async (
  id: string,
  payload: Partial<AnnouncementPayload>,
): Promise<Announcement> => {
  const res = await api.patch<Announcement>(`/content/announcements/manage/${id}/`, payload);
  return res.data;
};

// ── Search ────────────────────────────────────────────────────────────────────

export const searchContent = async (
  query: string,
  type?: 'all' | 'materials' | 'paths' | 'glossary' | 'faqs',
): Promise<GroupedSearchResults> => {
  const res = await api.get<SearchResultItem[]>('/content/search/', {
    params: { q: query, ...(type && type !== 'all' ? { type } : {}) },
  });
  return normalizeSearchResults(res.data);
};

// ── Meeting Invitations ───────────────────────────────────────────────────────

export const getInvitations = async (): Promise<MeetingInvitation[]> => {
  const res = await api.get<MeetingInvitation[] | { results: MeetingInvitation[] }>(
    '/meetings/invitations/',
  );
  return unwrap(res.data);
};

export const acceptInvitation = async (id: string): Promise<void> => {
  await api.post(`/meetings/invitations/${id}/accept/`);
};

export const declineInvitation = async (id: string): Promise<void> => {
  await api.post(`/meetings/invitations/${id}/decline/`);
};
