// src/types/auth.ts

export interface Certification {
  id?: string;
  name: string;
  issue_date?: string;
  expiry_date?: string;
  // add other fields as needed
}

export interface User {
  id: string;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: 'trainee' | 'supervisor' | 'admin' | 'instructor';
  status: string;
  organization: string;
  department: string;
  job_title: string;
  profile_picture: string | null;
  phone_number: string;
  bio: string;
  date_of_birth: string | null;
  address: string;
  training_level: string;
  total_score: number;
  simulations_completed: number;
  average_response_time: number;
  accuracy_rate: number;
  weak_areas: string[];        // Added
  strong_areas: string[];      // Added
  certifications: Certification[];
  email_verified: boolean;
  email_notifications: boolean;
  two_factor_enabled: boolean;
  created_at: string;
  last_active: string | null;
  can_create_meeting: boolean;
}

export interface LoginRequest {
  identifier: string;   // username or email
  password: string;
}

export interface LoginResponse {
  access: string;
  refresh: string;
  user: User;
}

export interface TwoFactorChallenge {
  requires_2fa: true;
  temp_token: string;
  message?: string;
}

export type LoginApiResponse = LoginResponse | TwoFactorChallenge;

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
  password2: string;
  first_name?: string;
  last_name?: string;
  organization?: string;
  job_title?: string;
}

export interface RegisterResponse {
  message: string;
  user: User;
}

export interface ChangePasswordRequest {
  old_password: string;
  new_password: string;
  new_password2: string;
}

export interface ChangePasswordResponse {
  message: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ForgotPasswordResponse {
  message: string;
}

export interface ResetPasswordRequest {
  token: string;
  new_password: string;
  new_password2: string;
}

export interface ResetPasswordResponse {
  message: string;
}

export interface VerifyEmailRequest {
  token: string;
}

export interface VerifyEmailResponse {
  message: string;
}

export interface ResendVerificationRequest {
  email: string;
}

export interface ResendVerificationResponse {
  message: string;
}

export interface ProfileUpdateRequest {
  first_name?: string;
  last_name?: string;
  organization?: string;
  department?: string;
  job_title?: string;
  phone_number?: string;
  bio?: string;
  date_of_birth?: string;
  address?: string;
  email_notifications?: boolean;
}

export interface TwoFactorSetupResponse {
  secret: string;
  otpauth_url: string;
  qr_code: string;
  two_factor_enabled: boolean;
}

export interface TwoFactorConfirmResponse {
  message: string;
  two_factor_enabled: boolean;
  backup_codes: string[];
}

export interface TwoFactorDisableRequest {
  password: string;
  otp: string;
}

export interface TwoFactorDisableResponse {
  message: string;
  two_factor_enabled: boolean;
}

export interface TwoFactorVerifyLoginRequest {
  temp_token: string;
  otp: string;
}

export type UserRole = User['role'];