import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthProvider';
import ProtectedRoute from './components/ProtectedRoute';
import Header from './components/Header';
import Footer from './components/Footer';
import ScrollToTop from './components/ScrollToTop';
import DashboardLayout from './components/DashboardLayout';
import TutorDashboardLayout from './components/TutorDashboardLayout';
import { RouteFallback } from './components/ui/RouteFallback';
import * as Pages from './App.lazy';

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="min-h-screen">
        <Suspense fallback={<RouteFallback />}>{children}</Suspense>
      </main>
      <Footer />
    </>
  );
}

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-900 dark:text-white mb-4">404</h1>
        <p className="text-xl text-gray-600 dark:text-gray-300 mb-8">Page not found</p>
        <Link
          to="/"
          className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
        >
          Return to Home
        </Link>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Layout><Pages.HomePage /></Layout>} />
          <Route path="/simulations" element={<Layout><Pages.PublicSimulationsPage /></Layout>} />
          <Route path="/features" element={<Layout><Pages.FeaturesPage /></Layout>} />
          <Route path="/usecases" element={<Layout><Pages.UseCasesPage /></Layout>} />
          <Route path="/about" element={<Layout><Pages.AboutPage /></Layout>} />
          <Route path="/pricing" element={<Layout><Pages.PricingPage /></Layout>} />
          <Route path="/contact" element={<Layout><Pages.ContactPage /></Layout>} />
          <Route path="/privacy" element={<Layout><Pages.PrivacyPage /></Layout>} />
          <Route path="/terms" element={<Layout><Pages.TermsPage /></Layout>} />
          <Route path="/help" element={<Layout><Pages.PublicHelpPage /></Layout>} />
          <Route
            path="/careers"
            element={
              <Layout>
                <Pages.ComingSoonPage
                  title="Careers"
                  description="We're growing fast. Job openings will be listed here — check back soon or follow us on LinkedIn for announcements."
                />
              </Layout>
            }
          />
          <Route path="/login" element={<Layout><Pages.LoginPage /></Layout>} />
          <Route path="/signup" element={<Layout><Pages.SignUpPage /></Layout>} />
          <Route path="/forgot-password" element={<Layout><Pages.ForgotPasswordPage /></Layout>} />
          <Route path="/reset-password" element={<Layout><Pages.ResetPasswordPage /></Layout>} />
          <Route path="/verify-email" element={<Layout><Pages.VerifyEmailPage /></Layout>} />
          <Route
            path="/auth/callback/google"
            element={
              <Lazy>
                <Pages.SocialAuthCallback />
              </Lazy>
            }
          />
          <Route
            path="/auth/callback/github"
            element={
              <Lazy>
                <Pages.SocialAuthCallback />
              </Lazy>
            }
          />

          <Route
            path="/dashboard/mission/:runId"
            element={
              <ProtectedRoute allowedRoles={['trainee']}>
                <Lazy>
                  <Pages.MissionPlayerPage />
                </Lazy>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/war-room"
            element={
              <ProtectedRoute allowedRoles={['supervisor', 'admin']}>
                <Lazy>
                  <Pages.SupervisorWarRoomPage />
                </Lazy>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRoles={['trainee']}>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Pages.DashboardPage />} />
            <Route path="lecture-schedule" element={<Pages.LectureSchedulePage />} />
            <Route path="learning-materials" element={<Pages.LearningMaterialsPage />} />
            <Route path="learning-materials/:slug" element={<Pages.MaterialDetailPage />} />
            <Route path="learning-paths/:slug" element={<Pages.LearningPathDetailPage />} />
            <Route path="bookmarks" element={<Pages.BookmarksPage />} />
            <Route path="search" element={<Pages.ContentSearchPage />} />
            <Route path="courses" element={<Pages.CoursesPage />} />
            <Route path="courses/:courseId" element={<Pages.CourseDetailPage />} />
            <Route path="simulations" element={<Pages.DashboardSimulationsPage />} />
            <Route path="analytics" element={<Pages.DashboardAnalyticsPage />} />
            <Route path="certifications" element={<Navigate to="/dashboard/certificates" replace />} />
            <Route path="certificates" element={<Pages.CertificationsPage />} />
            <Route path="calendar" element={<Pages.CalendarPage />} />
            <Route path="profile" element={<Pages.ProfilePage />} />
            <Route path="settings" element={<Pages.SettingsPage />} />
            <Route path="exercises" element={<Pages.ExercisesPage />} />
            <Route path="simulation/:sessionId" element={<Pages.SimulationPlayerPage />} />
            <Route path="reports" element={<Pages.ReportsPage />} />
            <Route path="help" element={<Pages.HelpPage />} />
          </Route>

          <Route
            path="/tutor"
            element={
              <ProtectedRoute allowedRoles={['supervisor', 'admin', 'instructor']}>
                <TutorDashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Pages.TutorDashboardPage />} />
            <Route path="dashboard" element={<Pages.TutorDashboardPage />} />
            <Route path="materials" element={<Pages.TutorMaterialsPage />} />
            <Route path="exercises" element={<Pages.TutorExercisesPage />} />
            <Route path="grading" element={<Pages.TutorGradingPage />} />
            <Route path="exercises/:exerciseId/submissions" element={<Pages.TutorExerciseSubmissionsPage />} />
            <Route path="students" element={<Pages.TutorStudentsPage />} />
            <Route path="students/:studentId" element={<Pages.TutorStudentDetailPage />} />
            <Route path="analytics" element={<Pages.TutorAnalyticsPage />} />
            <Route path="schedule" element={<Pages.TutorSchedulePage />} />
            <Route path="reports" element={<Pages.TutorReportsPage />} />
            <Route path="profile" element={<Pages.TutorProfilePage />} />
            <Route path="settings" element={<Pages.TutorSettingsPage />} />
            <Route path="courses" element={<Pages.TutorCourseBuilderPage />} />
            <Route path="courses/:courseId/enrollments" element={<Pages.TutorCourseEnrollmentsPage />} />
          </Route>

          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <TutorDashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Pages.TutorDashboardPage />} />
            <Route path="dashboard" element={<Pages.TutorDashboardPage />} />
            <Route path="materials" element={<Pages.TutorMaterialsPage />} />
            <Route path="exercises" element={<Pages.TutorExercisesPage />} />
            <Route path="grading" element={<Pages.TutorGradingPage />} />
            <Route path="exercises/:exerciseId/submissions" element={<Pages.TutorExerciseSubmissionsPage />} />
            <Route path="students" element={<Pages.TutorStudentsPage />} />
            <Route path="students/:studentId" element={<Pages.TutorStudentDetailPage />} />
            <Route path="analytics" element={<Pages.TutorAnalyticsPage />} />
            <Route path="schedule" element={<Pages.TutorSchedulePage />} />
            <Route path="reports" element={<Pages.TutorReportsPage />} />
            <Route path="profile" element={<Pages.TutorProfilePage />} />
            <Route path="settings" element={<Pages.TutorSettingsPage />} />
            <Route path="courses" element={<Pages.TutorCourseBuilderPage />} />
            <Route path="courses/:courseId/enrollments" element={<Pages.TutorCourseEnrollmentsPage />} />
            <Route path="stats" element={<Pages.AdminDashboardPage />} />
          </Route>

          <Route
            path="/meetings/join/:code"
            element={
              <ProtectedRoute allowedRoles={['trainee', 'supervisor', 'admin', 'instructor']}>
                <Lazy>
                  <Pages.MeetingRoom />
                </Lazy>
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Layout><NotFound /></Layout>} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
