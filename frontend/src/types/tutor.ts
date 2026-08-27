export interface User {
  id: string;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: string;
  profile_picture: string | null;
  organization: string;
  department: string;
  phone_number: string;
  bio: string;
  date_of_birth: string | null;
  address: string;
}

export interface ProfileUpdateRequest {
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  bio?: string;
  organization?: string;
  department?: string;
  address?: string;
  date_of_birth?: string;
}

export interface TutorProfile {
  id: string;
  user: User;
  full_name: string;
  email: string;
  specialization: string[];
  bio: string;
  qualifications: string[];
  experience_years: number;
  total_students: number;
  total_sessions: number;
  total_meetings: number;
  average_rating: number;
  default_meeting_duration: number;
  default_max_participants: number;
  allow_recording: boolean;
  allow_chat: boolean;
  allow_screen_share: boolean;
  created_at: string;
  updated_at: string;
}

export type TutorProfileUpdate = Partial<
  Omit<
    TutorProfile,
    | 'id'
    | 'user'
    | 'created_at'
    | 'updated_at'
    | 'total_students'
    | 'total_sessions'
    | 'total_meetings'
    | 'average_rating'
  >
>;

export interface TeachingMaterial {
  id: string;
  title: string;
  description: string;
  material_type: string;
  difficulty: string;
  file?: string;
  file_url?: string;
  video_url?: string;
  content?: Record<string, unknown>;
  tags: string[];
  duration_minutes?: number;
  is_published: boolean;
  is_featured?: boolean;
  views_count?: number;
  downloads_count?: number;
  average_rating?: number;
  created_at: string;
  updated_at: string;
  tutor_name?: string;
}

export interface TeachingSession {
  id: string;
  tutor?: string;
  title: string;
  description: string;
  session_type: string;
  platform: string;
  start_time: string;
  end_time: string;
  timezone?: string;
  meeting_link?: string;
  meeting_id?: string;
  /** Write-only when creating/updating; never returned on reads. */
  meeting_password?: string;
  has_meeting_password?: boolean;
  internal_meeting?: string | null;
  internal_meeting_details?: Record<string, unknown>;
  max_attendees: number;
  current_attendees: number;
  is_cancelled: boolean;
  cancellation_reason?: string;
  recording_url?: string;
  recording_available: boolean;
  status: string;
  is_full?: boolean;
  materials: string[];
  materials_count?: number;
  created_at: string;
  updated_at: string;
  tutor_name?: string;
  meeting_details?: {
    link: string;
    id: string;
    has_password: boolean;
  } | null;
}

export interface ExerciseWithAttempts extends Exercise {
  attempts_count: number;
  pending_count?: number;
}

export interface ExerciseAttemptDetail {
  id: string;
  exercise: string;
  exercise_title: string;
  student: string;
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

export interface StudentProgress {
  student_id: string;
  student_name: string;
  student_email: string;
  completed_materials: number;
  completed_exercises: number;
  meetings_attended: number;
  average_score: number;
  last_activity: string | null;
  strengths: string[];
  areas_for_improvement: string[];
  student?: Record<string, unknown>;
  progress_percentage?: number;
  attended_meetings?: string[];
}

export interface Question {
  text: string;
  options: string[];
  correct: number;
}

export interface Exercise {
  id: string;
  title: string;
  description: string;
  exercise_type: string;
  questions: Question[];
  answers?: Record<string, unknown>[];
  explanations?: Record<string, unknown>;
  time_limit_minutes?: number;
  passing_score: number;
  max_attempts: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  question_count?: number;
  tutor_name?: string;
}

export interface TutorDashboardStats {
  total_students: number;
  total_materials: number;
  total_exercises: number;
  total_meetings: number;
  upcoming_sessions: number;
  upcoming_meetings: number;
  recent_uploads: TeachingMaterial[];
  upcoming_sessions_list: TeachingSession[];
  upcoming_meetings_list: {
    id: string;
    title: string;
    code: string;
  }[];
  student_performance: StudentProgress[];
}

export interface Meeting {
  id: string;
  title: string;
  description: string;
  meeting_code: string;
  room_name: string;
  host: string;
  host_name: string;
  tutor_profile?: string;
  meeting_type: string;
  status: string;
  scheduled_start: string;
  scheduled_end: string;
  actual_start?: string;
  actual_end?: string;
  max_participants: number;
  participant_count: number;
  is_private: boolean;
  password?: string;
  allow_recording: boolean;
  allow_chat: boolean;
  allow_screen_share: boolean;
  waiting_room_enabled: boolean;
  lock_on_start: boolean;
  recording_available: boolean;
  created_at: string;
  updated_at: string;
}

export interface Report {
  id: string;
  title: string;
  type: 'student_performance' | 'exercise_analytics' | 'quarterly_review' | 'content_analysis';
  description?: string;
  file_url?: string;
  file_size: number;
  status: 'draft' | 'published' | 'generating';
  metadata?: {
    date_range?: { start: string; end: string };
  };
  created_at: string;
  updated_at: string;
}

export interface JoinMeetingResponse {
  meeting: Meeting;
  participant: {
    id: string;
    role: string;
    video_enabled: boolean;
    audio_enabled: boolean;
    /** Auth user id — use for host/self checks (not participant row id). */
    user_id?: string;
  };
  signaling: {
    websocket_url: string;
    ice_servers: Array<{ urls: string; username?: string; credential?: string }>;
  };
}

// ─── Meeting Participants ────────────────────────────────────────────────────

export interface MeetingParticipant {
  id: string;
  user: string;
  user_name: string;
  user_email: string;
  role: 'host' | 'participant';
  status: 'active' | 'waiting' | 'left';
  video_enabled: boolean;
  audio_enabled: boolean;
  screen_sharing: boolean;
  joined_at: string;
  left_at?: string;
}

// ─── Meeting Chat ────────────────────────────────────────────────────────────

export interface MeetingChatMessage {
  id: string;
  meeting: string;
  sender: string;
  sender_name: string;
  recipient?: string;
  recipient_name?: string;
  content: string;
  message_type: 'text' | 'system' | 'file';
  timestamp: string;
  is_private: boolean;
}

export interface SendChatMessageRequest {
  content: string;
  recipient_id?: string;
  message_type?: 'text' | 'system' | 'file';
}

// ─── Meeting Recordings ──────────────────────────────────────────────────────

export interface MeetingRecording {
  id: string;
  meeting: string;
  meeting_title: string;
  requested_by: string;
  requested_by_name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  file_path?: string;
  file_url?: string;
  duration?: number;
  file_size?: number;
  created_at: string;
  completed_at?: string;
}

export type ScheduleItem =
  | (TeachingSession & { type: 'session' })
  | (Meeting & { type: 'meeting' });

export function getStartTime(item: ScheduleItem): string {
  return item.type === 'session' ? item.start_time : item.scheduled_start;
}

export function getEndTime(item: ScheduleItem): string {
  return item.type === 'session' ? item.end_time : item.scheduled_end;
}

export function getJoinLink(item: ScheduleItem): string | undefined {
  if (item.type === 'meeting') {
    return `/meetings/join/${item.meeting_code}`;
  }
  return item.meeting_link;
}

export function getRecordingUrl(item: ScheduleItem): string | undefined {
  return item.type === 'session' ? item.recording_url : undefined;
}