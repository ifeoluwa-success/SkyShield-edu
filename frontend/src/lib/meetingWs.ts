import { buildWebSocketUrl } from './websocketUrl';

/** Meeting signaling path from the API (e.g. /ws/meeting/room_abc/). */
export function buildMeetingWebSocketUrl(apiPath: string, token: string): string {
  const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  return buildWebSocketUrl(path, { token });
}
