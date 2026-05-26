/**
 * Build a WebSocket URL for Django Channels (/ws/...).
 *
 * **Local dev** — Uses the Vite dev server host (e.g. ws://localhost:5173/ws/...)
 * so `/ws` is proxied to the backend. That is normal; you do not need wss:// on localhost
 * unless you run the app over https locally.
 *
 * **Production** — Pages are served over https, so the socket must be **wss://** on the
 * API host (derived from VITE_API_URL or VITE_WS_URL). Render and other hosts require this.
 */
export function buildWebSocketUrl(
  path: string,
  query?: Record<string, string | undefined>,
): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const params = new URLSearchParams();
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value != null && value !== '') {
        params.set(key, value);
      }
    }
  }
  const qs = params.toString() ? `?${params.toString()}` : '';

  const wsBase = (import.meta.env.VITE_WS_URL as string | undefined)?.replace(/\/$/, '');
  if (wsBase) {
    return `${wsBase}${normalizedPath}${qs}`;
  }

  if (import.meta.env.DEV) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}${normalizedPath}${qs}`;
  }

  const apiBase =
    (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://127.0.0.1:8000/api';
  const origin = new URL(apiBase).origin;
  const scheme = origin.startsWith('https') ? 'wss' : 'ws';
  return `${origin.replace(/^https?/, scheme)}${normalizedPath}${qs}`;
}
