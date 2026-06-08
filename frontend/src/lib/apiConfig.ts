/**
 * Single source of truth for the REST API base URL (axios baseURL).
 *
 * Production builds must use https:// — http:// hits Render's edge redirect
 * without CORS headers (browser shows "Network Error" on /api/simulations/courses/).
 */

export const DEFAULT_API_BASE = 'https://skyshield-backend.onrender.com/api';

function normalizeApiBase(candidate: string): string {
  const url = new URL(candidate.includes('://') ? candidate : `https://${candidate}`);

  if (import.meta.env.PROD && url.protocol === 'http:') {
    url.protocol = 'https:';
    if (typeof console !== 'undefined') {
      console.warn(
        '[api] VITE_API_URL used http://; upgraded to https://. ' +
          'Set VITE_API_URL=https://skyshield-backend.onrender.com/api on Render.',
      );
    }
  }

  let path = url.pathname.replace(/\/$/, '') || '';
  if (!path.endsWith('/api')) {
    path = path && path !== '/' ? `${path}/api` : '/api';
  }
  url.pathname = path;

  return url.toString().replace(/\/$/, '');
}

/** Resolved API base for axios (e.g. https://skyshield-backend.onrender.com/api). */
export function resolveApiBase(): string {
  const raw = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (!raw) {
    return DEFAULT_API_BASE;
  }
  try {
    return normalizeApiBase(raw);
  } catch {
    return DEFAULT_API_BASE;
  }
}

/** Origin without /api path — for media URLs and WebSocket host derivation. */
export function resolveApiOrigin(): string {
  try {
    return new URL(resolveApiBase()).origin;
  } catch {
    return new URL(DEFAULT_API_BASE).origin;
  }
}

/** Log misconfiguration once in production (visible in browser console). */
export function validateApiConfig(): void {
  if (!import.meta.env.PROD) {
    return;
  }
  const raw = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (raw?.startsWith('http://')) {
    console.error(
      '[api] VITE_API_URL must be https:// in production. Rebuild the frontend on Render with:\n' +
        'VITE_API_URL=https://skyshield-backend.onrender.com/api',
    );
  }
  const base = resolveApiBase();
  if (!base.startsWith('https://')) {
    console.error('[api] API base is not HTTPS:', base);
  }
}

/** Force https on a fully qualified request URL (axios interceptor helper). */
export function ensureHttpsUrl(url: string): string {
  if (!import.meta.env.PROD || !url.startsWith('http://')) {
    return url;
  }
  return url.replace(/^http:\/\//i, 'https://');
}
