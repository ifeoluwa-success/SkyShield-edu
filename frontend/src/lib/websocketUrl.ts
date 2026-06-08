import {
  DEFAULT_API_BASE,
  ensureHttpsUrl,
  resolveApiBase,
  resolveApiOrigin,
} from './apiConfig';

export { DEFAULT_API_BASE, resolveApiBase, resolveApiOrigin };

function httpOriginToWsOrigin(httpOrigin: string): string {
  const url = new URL(httpOrigin);
  if (!url.hostname) {
    throw new Error(`API origin has no hostname: ${httpOrigin}`);
  }
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.origin;
}

/** WebSocket origin (scheme + host + port), with validation and safe fallbacks. */
export function resolveWebSocketOrigin(): string {
  const wsOverride = (import.meta.env.VITE_WS_URL as string | undefined)?.trim();
  if (wsOverride) {
    const candidate = wsOverride.includes('://') ? wsOverride : `wss://${wsOverride}`;
    try {
      const url = new URL(ensureHttpsUrl(candidate));
      if (url.hostname) {
        url.protocol = url.protocol === 'https:' || url.protocol === 'wss:' ? 'wss:' : 'ws:';
        return url.origin;
      }
    } catch {
      /* fall through */
    }
    if (import.meta.env.DEV) {
      console.warn(
        '[websocket] VITE_WS_URL is invalid or missing a hostname (e.g. "wss://"); using VITE_API_URL instead.',
      );
    }
  }

  try {
    return httpOriginToWsOrigin(resolveApiOrigin());
  } catch {
    return httpOriginToWsOrigin(new URL(DEFAULT_API_BASE).origin);
  }
}

export function buildWebSocketUrl(
  path: string,
  query?: Record<string, string | undefined>,
): string {
  const trimmed = path.trim();

  let url: URL;

  if (/^wss?:\/\//i.test(trimmed)) {
    url = new URL(ensureHttpsUrl(trimmed));
  } else if (import.meta.env.DEV) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const normalizedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    url = new URL(`${protocol}//${window.location.host}${normalizedPath}`);
  } else {
    const normalizedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    url = new URL(`${resolveWebSocketOrigin()}${normalizedPath}`);
  }

  if (!url.hostname) {
    throw new Error(
      'WebSocket URL has no hostname. On Render, set VITE_API_URL=https://skyshield-backend.onrender.com/api and remove VITE_WS_URL if it is only "wss://".',
    );
  }

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value != null && value !== '') {
        url.searchParams.set(key, value);
      }
    }
  }

  return url.toString();
}
