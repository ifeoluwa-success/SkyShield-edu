/** Dispatched when tokens are cleared (expired refresh, invalid session). */
export const AUTH_SESSION_EXPIRED = 'skyshield:auth-session-expired';

export function notifySessionExpired(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED));
}

export function clearStoredSession(): void {
  try {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
  } catch {
    // ignore
  }
  notifySessionExpired();
}
