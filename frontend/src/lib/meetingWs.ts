/**
 * Build a WebSocket URL for meeting signaling.
 * In dev, routes through the Vite proxy (/ws → backend) so origin matches the app.
 */
export function buildMeetingWebSocketUrl(apiPath: string, token: string): string {
  const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  const qs = token ? `?token=${encodeURIComponent(token)}` : '';

  if (import.meta.env.DEV) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}${path}${qs}`;
  }

  const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://127.0.0.1:8000/api';
  const origin = new URL(apiBase).origin;
  const scheme = origin.startsWith('https') ? 'wss' : 'ws';
  return `${origin.replace(/^https?/, scheme)}${path}${qs}`;
}
