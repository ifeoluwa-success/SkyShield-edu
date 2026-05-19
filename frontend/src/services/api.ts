// src/services/api.ts
import axios, { AxiosError } from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'https://skyshield-backend.onrender.com/api';

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

// ── Request interceptor: attach access token ──────────────────────────────────
api.interceptors.request.use(
  config => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => Promise.reject(error),
);

// ── Track whether we are currently refreshing so we don't loop ───────────────
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null) => {
  failedQueue.forEach(prom => {
    if (error) prom.reject(error);
    else prom.resolve(token!);
  });
  failedQueue = [];
};

// ── Response interceptor: handle 401 gracefully ───────────────────────────────
api.interceptors.response.use(
  response => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as typeof error.config & { _retry?: boolean };

    // ── KEY FIX: Never intercept auth endpoints. ──────────────────────────────
    // If the login or token endpoints themselves return 401/4xx, let the error
    // propagate directly to the caller (LoginPage) so it can show the message.
    const url = originalRequest?.url ?? '';
    const isAuthEndpoint =
      url.includes('/users/login/') ||
      url.includes('/users/token/refresh/') ||
      url.includes('/users/register/') ||
      url.includes('/users/google/') ||
      url.includes('/users/github/');

    if (isAuthEndpoint) {
      return Promise.reject(error);
    }

    // Only attempt a token refresh for non-auth 401s (e.g. expired session)
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Queue this request until the in-flight refresh finishes
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(token => {
            originalRequest.headers!.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch(err => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refresh_token');

      if (!refreshToken) {
        // No refresh token — clear storage and let the caller deal with it
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        processQueue(error, null);
        isRefreshing = false;
        return Promise.reject(error);
      }

      try {
        // ── FIX: use the correct refresh endpoint from your urls.py ──────────
        const { data } = await axios.post(
          `${BASE_URL}/users/token/refresh/`,
          { refresh: refreshToken },
          { headers: { 'Content-Type': 'application/json' } },
        );

        const newAccess: string = data.access;
        localStorage.setItem('access_token', newAccess);
        api.defaults.headers.common.Authorization = `Bearer ${newAccess}`;

        processQueue(null, newAccess);
        originalRequest.headers!.Authorization = `Bearer ${newAccess}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed — session is truly expired, clean up quietly
        processQueue(refreshError, null);
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        // Redirect to login only if not already there
        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export default api;