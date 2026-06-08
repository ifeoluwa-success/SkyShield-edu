// src/services/api.ts
import axios, { AxiosError } from 'axios';
import { clearStoredSession } from '../lib/authSession';
import { ensureHttpsUrl, resolveApiBase } from '../lib/apiConfig';

const api = axios.create({
  baseURL: resolveApiBase(),
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

// ── Request interceptor: attach token + never call http:// API in production ─
api.interceptors.request.use(
  config => {
    if (config.baseURL) {
      config.baseURL = ensureHttpsUrl(config.baseURL);
    }
    if (config.url) {
      config.url = ensureHttpsUrl(config.url);
    }

    const token = localStorage.getItem('access_token')?.trim();
    if (token) {
      config.headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
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

    const url = originalRequest?.url ?? '';
    const isAuthEndpoint =
      url.includes('/users/login/') ||
      url.includes('/users/token/refresh/') ||
      url.includes('/users/register/');

    if (isAuthEndpoint) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
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
        clearStoredSession();
        processQueue(error, null);
        isRefreshing = false;
        return Promise.reject(error);
      }

      try {
        const refreshUrl = ensureHttpsUrl(`${resolveApiBase()}/users/token/refresh/`);
        const { data } = await axios.post(
          refreshUrl,
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
        processQueue(refreshError, null);
        clearStoredSession();
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
