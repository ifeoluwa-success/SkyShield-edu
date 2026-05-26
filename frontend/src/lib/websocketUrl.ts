/**
 * Build a WebSocket URL for Django Channels (/ws/...).
 *
 * Local dev: ws://localhost:5173/ws/... (Vite proxy).
 * Production: wss://<api-host>/ws/... (must include a hostname — never bare "wss://").
 */

export const DEFAULT_API_BASE = 'https://skyshield-backend.onrender.com/api';

/** Same default as api.ts; treats blank env as unset. */
export function resolveApiBase(): string {
  const raw = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  return raw ? raw : DEFAULT_API_BASE;
}

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
      const url = new URL(candidate);
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
    const apiUrl = new URL(resolveApiBase());
    if (!apiUrl.hostname) {
      throw new Error('no hostname');
    }
    return httpOriginToWsOrigin(apiUrl.origin);
  } catch {
    return httpOriginToWsOrigin(new URL(DEFAULT_API_BASE).origin);
  }
}

export function buildWebSocketUrl(
  path: string,
  query?: Record<string, string | undefined>,
): string {
  const trimmed = path.trim();

  const params = new URLSearchParams();
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value != null && value !== '') {
        params.set(key, value);
      }
    }
  }

  let url: URL;

  if (/^wss?:\/\//i.test(trimmed)) {
    url = new URL(trimmed);
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
