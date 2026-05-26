import { buildWebSocketUrl } from '../lib/websocketUrl';

/** Mission / simulation run WebSocket (Channels: /ws/mission/<runId>/). */
export function buildMissionWebSocketUrl(runId: string, token: string): string {
  const path = `/ws/mission/${encodeURIComponent(runId)}/`;
  return buildWebSocketUrl(path, { token });
}
