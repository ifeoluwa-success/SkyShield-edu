/**
 * Build mission WebSocket URL from the same origin as VITE_API_URL (local dev vs production).
 */
export function buildMissionWebSocketUrl(runId: string, token: string): string {
  const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api';
  const origin = new URL(apiBase).origin;
  const scheme = origin.startsWith('https') ? 'wss' : 'ws';
  const wsOrigin = origin.replace(/^https?/, scheme);
  const path = `/ws/mission/${encodeURIComponent(runId)}/`;
  return `${wsOrigin}${path}?token=${encodeURIComponent(token)}`;
}
