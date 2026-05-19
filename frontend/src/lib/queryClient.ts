import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export const queryKeys = {
  profile: ['profile'] as const,
  hasExercises: ['hasExercises'] as const,
  dashboard: {
    analytics: ['dashboard', 'analytics'] as const,
    performance: ['dashboard', 'performance'] as const,
    sessions: ['dashboard', 'sessions'] as const,
    learningPath: ['dashboard', 'learningPath'] as const,
  },
  content: {
    materials: (filters: Record<string, string | undefined>) =>
      ['content', 'materials', filters] as const,
    material: (slug: string) => ['content', 'material', slug] as const,
    categories: ['content', 'categories'] as const,
    paths: ['content', 'paths'] as const,
    path: (slug: string) => ['content', 'path', slug] as const,
    announcements: ['content', 'announcements'] as const,
    bookmarks: ['content', 'bookmarks'] as const,
  },
  simulations: {
    scenarios: (filters: { difficulty?: string; category?: string }) =>
      ['simulations', 'scenarios', filters] as const,
    sessionsMap: (scenarioIds: string[]) =>
      ['simulations', 'sessionsMap', scenarioIds.sort().join(',')] as const,
  },
  courses: {
    list: ['courses', 'list'] as const,
    progress: (courseId: string) => ['courses', 'progress', courseId] as const,
  },
};
