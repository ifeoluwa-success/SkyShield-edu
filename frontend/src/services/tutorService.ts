import api from './api';
import type {
  TutorProfile,
  TeachingMaterial,
  TeachingSession,
  StudentProgress,
  Exercise,
  TutorDashboardStats,
  Meeting,
  Report,
  JoinMeetingResponse,
  MeetingParticipant,
  MeetingChatMessage,
  SendChatMessageRequest,
  MeetingRecording,
} from '../types/tutor';
import type { User, ProfileUpdateRequest } from '../types/auth';

// =============================================================================
// EXERCISE ATTEMPT TYPES (EXPORTED)
// =============================================================================

export interface ExerciseAttemptDetail {
  id: string;
  exercise_id: string;
  exercise_title: string;
  student_id: string;
  student_name: string;
  student_email: string;
  score: number;
  answers: Record<string, unknown>;
  time_taken: number;
  passed: boolean;
  attempt_number: number;
  feedback: string;
  started_at: string;
  completed_at: string | null;
}

export interface ExerciseWithAttempts extends Exercise {
  attempts_count: number;
  pending_count?: number;
}

// =============================================================================
// TUTOR PROFILE
// =============================================================================

export const getTutorProfile = async (): Promise<TutorProfile> => {
  const response = await api.get<TutorProfile>('/tutor/profile/');
  return response.data;
};

export const updateTutorProfile = async (data: Partial<TutorProfile>): Promise<TutorProfile> => {
  const response = await api.patch<TutorProfile>('/tutor/profile/', data);
  return response.data;
};

export const updateUserProfile = async (data: ProfileUpdateRequest): Promise<User> => {
  const response = await api.patch<User>('/users/profile/', data);
  const updated = response.data;
  localStorage.setItem('user', JSON.stringify(updated));
  return updated;
};

// =============================================================================
// DASHBOARD
// =============================================================================

export const getTutorDashboardStats = async (): Promise<TutorDashboardStats> => {
  const response = await api.get<TutorDashboardStats>('/tutor/dashboard/');
  return response.data;
};

// =============================================================================
// TEACHING MATERIALS
// =============================================================================

function unwrapList<T>(data: T[] | { results?: T[] } | null | undefined): T[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && Array.isArray(data.results)) return data.results;
  return [];
}

export const getMaterials = async (params?: {
  material_type?: string;
  difficulty?: string;
  search?: string;
}): Promise<TeachingMaterial[]> => {
  const response = await api.get<TeachingMaterial[] | { results: TeachingMaterial[] }>(
    '/tutor/materials/',
    { params },
  );
  return unwrapList(response.data);
};

export const uploadMaterial = async (formData: FormData): Promise<TeachingMaterial> => {
  const response = await api.post<TeachingMaterial>('/tutor/materials/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const updateMaterial = async (id: string, data: Partial<TeachingMaterial>): Promise<TeachingMaterial> => {
  const response = await api.patch<TeachingMaterial>(`/tutor/materials/${id}/`, data);
  return response.data;
};

export const deleteMaterial = async (id: string): Promise<void> => {
  await api.delete(`/tutor/materials/${id}/`);
};

export const publishMaterial = async (id: string): Promise<TeachingMaterial> => {
  const response = await api.post<TeachingMaterial>(`/tutor/materials/${id}/publish/`);
  return response.data;
};

export const unpublishMaterial = async (id: string): Promise<TeachingMaterial> => {
  const response = await api.post<TeachingMaterial>(`/tutor/materials/${id}/unpublish/`);
  return response.data;
};

// =============================================================================
// EXERCISES
// =============================================================================

export const getExercises = async (params?: {
  exercise_type?: string;
  search?: string;
}): Promise<Exercise[]> => {
  const response = await api.get<{ results: Exercise[] }>('/tutor/exercises/', { params });
  return response.data.results;
};

export const createExercise = async (data: Omit<Exercise, 'id' | 'created_at' | 'updated_at'>): Promise<Exercise> => {
  const response = await api.post<Exercise>('/tutor/exercises/', data);
  return response.data;
};

export const updateExercise = async (id: string, data: Partial<Exercise>): Promise<Exercise> => {
  const response = await api.patch<Exercise>(`/tutor/exercises/${id}/`, data);
  return response.data;
};

export const deleteExercise = async (id: string): Promise<void> => {
  await api.delete(`/tutor/exercises/${id}/`);
};

// =============================================================================
// EXERCISE ATTEMPTS & GRADING
// =============================================================================

export const getExercisesWithAttempts = async (): Promise<ExerciseWithAttempts[]> => {
  const response = await api.get<ExerciseWithAttempts[]>('/tutor/exercises/with-attempts/');
  return response.data;
};

export const getExerciseAttempts = async (
  exerciseId: string,
  params?: { student_id?: string; passed?: string }
): Promise<ExerciseAttemptDetail[]> => {
  const response = await api.get<ExerciseAttemptDetail[] | { results: ExerciseAttemptDetail[] }>(
    `/tutor/exercises/${exerciseId}/attempts/`,
    { params },
  );
  return unwrapList(response.data);
};

export const updateExerciseAttempt = async (
  attemptId: string,
  data: { score: number; feedback?: string; passed?: boolean }
): Promise<ExerciseAttemptDetail> => {
  const response = await api.patch<ExerciseAttemptDetail>(`/tutor/exercise-attempts/${attemptId}/`, data);
  return response.data;
};

// =============================================================================
// STUDENTS (PROGRESS)
// =============================================================================

export const getStudents = async (params?: {
  search?: string;
  sort_by?: string;
}): Promise<StudentProgress[]> => {
  const response = await api.get<{ results: StudentProgress[] }>('/tutor/students/', { params });
  return response.data.results;
};

export const getStudentProgress = async (studentId: string): Promise<StudentProgress> => {
  const response = await api.get<StudentProgress>(`/tutor/students/${studentId}/`);
  return response.data;
};

export const addStudentNotes = async (studentId: string, notes: string): Promise<StudentProgress> => {
  const response = await api.post<StudentProgress>(`/tutor/students/${studentId}/notes/`, { notes });
  return response.data;
};

export const trackMeetingAttendance = async (studentId: string, meetingId: string): Promise<void> => {
  await api.post(`/tutor/students/${studentId}/track-meeting/`, { meeting_id: meetingId });
};

// =============================================================================
// TEACHING SESSIONS
// =============================================================================

export const getTeachingSessions = async (params?: {
  status?: string;
  from_date?: string;
  to_date?: string;
}): Promise<TeachingSession[]> => {
  const response = await api.get<{ results: TeachingSession[] }>('/tutor/sessions/', { params });
  return response.data.results;
};

export const createTeachingSession = async (
  data: Omit<TeachingSession, 'id' | 'created_at' | 'updated_at'>
): Promise<TeachingSession> => {
  const response = await api.post<TeachingSession>('/tutor/sessions/', data);
  return response.data;
};

export const updateTeachingSession = async (id: string, data: Partial<TeachingSession>): Promise<TeachingSession> => {
  const response = await api.patch<TeachingSession>(`/tutor/sessions/${id}/`, data);
  return response.data;
};

export const deleteTeachingSession = async (id: string): Promise<void> => {
  await api.delete(`/tutor/sessions/${id}/`);
};

export const cancelSession = async (id: string, reason?: string): Promise<TeachingSession> => {
  const response = await api.post<TeachingSession>(`/tutor/sessions/${id}/cancel/`, { reason });
  return response.data;
};

export const addRecordingToSession = async (id: string, recording_url: string): Promise<TeachingSession> => {
  const response = await api.post<TeachingSession>(`/tutor/sessions/${id}/add_recording/`, { recording_url });
  return response.data;
};

// =============================================================================
// MEETINGS
// =============================================================================

export const getMeetings = async (params?: {
  status?: string;
  type?: string;
}): Promise<Meeting[]> => {
  const response = await api.get<{ results: Meeting[] }>('/meetings/meetings/', { params });
  return response.data.results;
};

export const createMeeting = async (data: Omit<Meeting, 'id' | 'created_at' | 'updated_at'>): Promise<Meeting> => {
  const response = await api.post<Meeting>('/meetings/meetings/', data);
  return response.data;
};

export const deleteMeeting = async (id: string): Promise<void> => {
  await api.delete(`/meetings/meetings/${id}/`);
};

export const joinMeeting = async (meetingCode: string, password?: string): Promise<JoinMeetingResponse> => {
  const response = await api.post<JoinMeetingResponse & {
    meeting?: Meeting & { code?: string; room?: string };
    participant?: JoinMeetingResponse['participant'] & { user?: string };
  }>('/meetings/meetings/join/', {
    meeting_code: meetingCode.trim(),
    password,
  });
  const raw = response.data;
  const m = raw.meeting;
  const p = raw.participant;

  return {
    ...raw,
    meeting: {
      ...m,
      meeting_code: m.meeting_code ?? m.code ?? meetingCode.trim(),
      room_name: m.room_name ?? m.room ?? '',
      host: m.host ?? p?.user ?? '',
    },
    participant: {
      id: p.id,
      role: p.role,
      video_enabled: p.video_enabled ?? false,
      audio_enabled: p.audio_enabled ?? false,
      user_id: p.user ?? (p as { user_id?: string }).user_id,
    },
  };
};

export const startMeeting = async (id: string): Promise<Meeting> => {
  const response = await api.post<Meeting>(`/meetings/meetings/${id}/start/`);
  return response.data;
};

export const endMeeting = async (id: string): Promise<Meeting> => {
  const response = await api.post<Meeting>(`/meetings/meetings/${id}/end/`);
  return response.data;
};

export const inviteToMeeting = async (id: string, emails: string[]): Promise<void> => {
  await api.post(`/meetings/meetings/${id}/invite/`, { emails });
};

export const requestMeetingRecording = async (id: string): Promise<void> => {
  await api.post(`/meetings/meetings/${id}/request_recording/`);
};

export const getUpcomingMeetings = async (): Promise<Meeting[]> => {
  const response = await api.get<Meeting[] | { results: Meeting[] }>('/meetings/upcoming/');
  const data = response.data;
  if (Array.isArray(data)) return data;
  if (data && 'results' in data) return data.results;
  return [];
};

// ─── Meeting Participants ────────────────────────────────────────────────────

export const getMeetingParticipants = async (meetingId: string): Promise<MeetingParticipant[]> => {
  const response = await api.get<MeetingParticipant[]>(`/meetings/meetings/${meetingId}/participants/`);
  return response.data;
};

// ─── Meeting Chat ────────────────────────────────────────────────────────────

export const sendChatMessage = async (
  meetingId: string,
  data: SendChatMessageRequest,
): Promise<MeetingChatMessage> => {
  const response = await api.post<MeetingChatMessage>(`/meetings/meetings/${meetingId}/chat/`, data);
  return response.data;
};

export const getChatHistory = async (
  meetingId: string,
  params?: { limit?: number; before?: string },
): Promise<MeetingChatMessage[]> => {
  const response = await api.get<MeetingChatMessage[]>(`/meetings/meetings/${meetingId}/chat_history/`, {
    params,
  });
  return response.data;
};

// ─── Meeting Recordings ──────────────────────────────────────────────────────

export const getMeetingRecordings = async (meetingId: string): Promise<MeetingRecording[]> => {
  const response = await api.get<MeetingRecording[]>(`/meetings/meetings/${meetingId}/recordings/`);
  return response.data;
};

// =============================================================================
// REPORTS
// =============================================================================

export const getReports = async (params?: {
  type?: string;
  status?: string;
}): Promise<Report[]> => {
  const response = await api.get<{ results: Report[] }>('/tutor/reports/', { params });
  return response.data.results;
};

export const generateReport = async (data: {
  title: string;
  type: string;
  date_range?: { start: string; end: string };
}): Promise<Report> => {
  const response = await api.post<Report>('/tutor/reports/generate/', data);
  return response.data;
};

export const deleteReport = async (id: string): Promise<void> => {
  await api.delete(`/tutor/reports/${id}/`);
};

export const downloadReport = async (id: string): Promise<Blob> => {
  const response = await api.get(`/tutor/reports/${id}/download/`, {
    responseType: 'blob',
  });
  return response.data;
};

// =============================================================================
// RE-EXPORTS FROM AUTH SERVICE
// =============================================================================

export { uploadAvatar } from './authService';
export { changePassword } from './authService';