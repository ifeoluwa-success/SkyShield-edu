// src/services/authService.ts
import api from './api';
import type {
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
  ChangePasswordRequest,
  ChangePasswordResponse,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  ResetPasswordRequest,
  ResetPasswordResponse,
  VerifyEmailRequest,
  VerifyEmailResponse,
  ResendVerificationRequest,
  ResendVerificationResponse,
  ProfileUpdateRequest,
  User,
} from '../types/auth';

export const login = async (credentials: LoginRequest): Promise<LoginResponse> => {
  const response = await api.post<LoginResponse>('/users/login/', credentials);
  const data = response.data;
  if (!data.access || !data.refresh) {
    throw new Error('Login succeeded but the server did not return access tokens.');
  }
  return data;
};

export const register = async (userData: RegisterRequest): Promise<RegisterResponse> => {
  // Map frontend field names to backend serializer field names
  const payload = {
    ...userData,
    company: userData.organization,
    role: userData.job_title,
  };
  const response = await api.post<RegisterResponse>('/users/register/', payload);
  return response.data;
};

export const logout = async (): Promise<void> => {
  const refresh = localStorage.getItem('refresh_token');
  try {
    await api.post('/users/logout/', { refresh });
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
  }
};

export const getProfile = async (): Promise<User> => {
  const response = await api.get<User>('/users/profile/');
  return response.data;
};

export const updateProfile = async (data: ProfileUpdateRequest): Promise<User> => {
  const response = await api.patch<User>('/users/profile/', data);
  return response.data;
};

export const changePassword = async (
  data: ChangePasswordRequest
): Promise<ChangePasswordResponse> => {
  const response = await api.post<ChangePasswordResponse>('/users/change-password/', data);
  return response.data;
};

export const forgotPassword = async (
  data: ForgotPasswordRequest
): Promise<ForgotPasswordResponse> => {
  const response = await api.post<ForgotPasswordResponse>('/users/forgot-password/', data);
  return response.data;
};

export const resetPassword = async (
  data: ResetPasswordRequest
): Promise<ResetPasswordResponse> => {
  const response = await api.post<ResetPasswordResponse>('/users/reset-password/', data);
  return response.data;
};

export const verifyEmail = async (
  data: VerifyEmailRequest
): Promise<VerifyEmailResponse> => {
  const response = await api.post<VerifyEmailResponse>('/users/verify-email/', data);
  return response.data;
};

export const resendVerification = async (
  data: ResendVerificationRequest
): Promise<ResendVerificationResponse> => {
  const response = await api.post<ResendVerificationResponse>('/users/resend-verification/', data);
  return response.data;
};

// ─── Devices ──────────────────────────────────────────────────────────────────

/** Backend may send browser/os as a string or nested object (e.g. `{ browser: "Chrome" }`). */
export type DeviceField = string | Record<string, unknown>;

export interface UserDevice {
  id: string;
  device_name?: string;
  device_type?: string;
  browser?: DeviceField;
  os?: DeviceField;
  ip_address?: string;
  is_trusted: boolean;
  last_used?: string;
  created_at: string;
}

export interface UserSession {
  id: string;
  session_id?: string;
  ip_address?: string;
  device_info?: DeviceField;
  browser?: DeviceField;
  os?: DeviceField;
  is_active: boolean;
  login_time: string;
  logout_time?: string | null;
}

function unwrapList<T>(data: T[] | { results: T[] }): T[] {
  if (Array.isArray(data)) return data;
  if (data && 'results' in data) return data.results;
  return [];
}

export const getDevices = async (): Promise<UserDevice[]> => {
  const res = await api.get<UserDevice[] | { results: UserDevice[] }>('/users/devices/');
  return unwrapList(res.data);
};

export const trustDevice = async (id: string): Promise<void> => {
  await api.post(`/users/devices/${id}/trust/`);
};

export const untrustDevice = async (id: string): Promise<void> => {
  await api.post(`/users/devices/${id}/untrust/`);
};

export const removeDevice = async (id: string): Promise<void> => {
  await api.delete(`/users/devices/${id}/`);
};

export const getActiveSessions = async (): Promise<UserSession[]> => {
  const res = await api.get<UserSession[] | { results: UserSession[] }>('/users/sessions/');
  return unwrapList(res.data);
};

export const terminateSession = async (id: string): Promise<void> => {
  await api.post(`/users/sessions/${id}/terminate/`);
};

export const terminateOtherSessions = async (): Promise<void> => {
  await api.post('/users/sessions/terminate-others/');
};

// ─── Notifications ────────────────────────────────────────────────────────────

export interface BackendNotification {
  id: string;
  notification_type?: string;
  type?: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export const getNotifications = async (): Promise<BackendNotification[]> => {
  const response = await api.get<BackendNotification[] | { results: BackendNotification[] }>(
    '/users/notifications/',
  );
  const data = response.data;
  if (Array.isArray(data)) return data;
  if (data && 'results' in data) return data.results;
  return [];
};

export const markNotificationRead = async (id: string): Promise<void> => {
  await api.post(`/users/notifications/${id}/mark_read/`);
};

export const markAllNotificationsRead = async (): Promise<void> => {
  await api.post('/users/notifications/mark_all_read/');
};

// ─────────────────────────────────────────────────────────────────────────────

export const refreshToken = async (): Promise<{ access: string }> => {
  const refresh = localStorage.getItem('refresh_token');
  const response = await api.post<{ access: string }>('/users/token/refresh/', { refresh });
  if (response.data.access) {
    localStorage.setItem('access_token', response.data.access);
  }
  return response.data;
};

/**
 * Upload a profile picture (avatar) for the current user.
 * The file is sent as multipart/form-data under the field name "profile_picture".
 * Returns the updated user object.
 */
export const uploadAvatar = async (file: File): Promise<User> => {
  const formData = new FormData();
  formData.append('profile_picture', file);
  
  const response = await api.patch<User>('/users/profile/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  
  // Update stored user data
  const updatedUser = response.data;
  localStorage.setItem('user', JSON.stringify(updatedUser));
  return updatedUser;
};