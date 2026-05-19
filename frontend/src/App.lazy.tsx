/** Lazy route modules — split by area to keep initial bundle small. */
import { lazy } from 'react';

// Public marketing (loaded on demand per route)
export const HomePage = lazy(() => import('./pages/HomePage'));
export const PublicSimulationsPage = lazy(() => import('./pages/SimulationsPage'));
export const FeaturesPage = lazy(() => import('./pages/FeaturesPage'));
export const UseCasesPage = lazy(() => import('./pages/UseCasesPage'));
export const AboutPage = lazy(() => import('./pages/AboutPage'));
export const PricingPage = lazy(() => import('./pages/PricingPage'));
export const ContactPage = lazy(() => import('./pages/ContactPage'));
export const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
export const TermsPage = lazy(() => import('./pages/TermsPage'));
export const PublicHelpPage = lazy(() => import('./pages/PublicHelpPage'));
export const ComingSoonPage = lazy(() => import('./pages/ComingSoonPage'));

// Auth
export const LoginPage = lazy(() => import('./pages/LoginPage'));
export const SignUpPage = lazy(() => import('./pages/SignUpPage'));
export const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
export const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
export const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'));
export const SocialAuthCallback = lazy(() => import('./pages/SocialAuthCallback'));

// Trainee dashboard
export const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'));
export const DashboardSimulationsPage = lazy(() => import('./pages/dashboard/SimulationsPage'));
export const DashboardAnalyticsPage = lazy(() => import('./pages/dashboard/AnalyticsPage'));
export const CertificationsPage = lazy(() => import('./pages/dashboard/CertificationsPage'));
export const CalendarPage = lazy(() => import('./pages/dashboard/CalendarPage'));
export const ProfilePage = lazy(() => import('./pages/dashboard/ProfilePage'));
export const SettingsPage = lazy(() => import('./pages/dashboard/SettingsPage'));
export const LectureSchedulePage = lazy(() => import('./pages/dashboard/LectureSchedulePage'));
export const LearningMaterialsPage = lazy(() => import('./pages/dashboard/LearningMaterialsPage'));
export const MaterialDetailPage = lazy(() => import('./pages/dashboard/MaterialDetailPage'));
export const LearningPathDetailPage = lazy(() => import('./pages/dashboard/LearningPathDetailPage'));
export const BookmarksPage = lazy(() => import('./pages/dashboard/BookmarksPage'));
export const ContentSearchPage = lazy(() => import('./pages/dashboard/ContentSearchPage'));
export const ExercisesPage = lazy(() => import('./pages/dashboard/ExercisesPage'));
export const SimulationPlayerPage = lazy(() => import('./pages/dashboard/SimulationPlayerPage'));
export const ReportsPage = lazy(() => import('./pages/dashboard/ReportsPage'));
export const HelpPage = lazy(() => import('./pages/dashboard/HelpPage'));
export const CoursesPage = lazy(() => import('./pages/dashboard/CoursesPage'));
export const CourseDetailPage = lazy(() => import('./pages/dashboard/CourseDetailPage'));

// Mission / war room (heavy)
export const MissionPlayerPage = lazy(() => import('./pages/dashboard/MissionPlayerPage'));
export const SupervisorWarRoomPage = lazy(() => import('./pages/dashboard/SupervisorWarRoomPage'));

// Tutor / admin
export const TutorDashboardPage = lazy(() => import('./pages/tutor/TutorDashboardPage'));
export const TutorMaterialsPage = lazy(() => import('./pages/tutor/TutorMaterialsPage'));
export const TutorExercisesPage = lazy(() => import('./pages/tutor/TutorExercisesPage'));
export const TutorStudentsPage = lazy(() => import('./pages/tutor/TutorStudentsPage'));
export const TutorAnalyticsPage = lazy(() => import('./pages/tutor/TutorAnalyticsPage'));
export const TutorSchedulePage = lazy(() => import('./pages/tutor/TutorSchedulePage'));
export const TutorReportsPage = lazy(() => import('./pages/tutor/TutorReportsPage'));
export const TutorProfilePage = lazy(() => import('./pages/tutor/TutorProfilePage'));
export const TutorSettingsPage = lazy(() => import('./pages/tutor/TutorSettingsPage'));
export const TutorCourseBuilderPage = lazy(() => import('./pages/tutor/TutorCourseBuilderPage'));
export const TutorCourseEnrollmentsPage = lazy(() => import('./pages/tutor/TutorCourseEnrollmentsPage'));
export const TutorExerciseSubmissionsPage = lazy(() => import('./pages/tutor/TutorExerciseSubmissionsPage'));
export const TutorGradingPage = lazy(() => import('./pages/tutor/TutorGradingPage'));
export const TutorStudentDetailPage = lazy(() => import('./pages/tutor/TutorStudentDetailPage'));
export const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'));

// Meetings (WebRTC + polyfills)
export const MeetingRoom = lazy(() => import('./pages/meetings/MeetingRoom'));
