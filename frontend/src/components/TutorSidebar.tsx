// src/components/TutorSidebar.tsx
import { useState, useEffect } from 'react';
import {
  Home,
  Upload,
  BookOpen,
  Calendar,
  Users,
  BarChart3,
  FileText,
  ClipboardCheck,
  Target,
  ScrollText,
  GraduationCap,
  UserCheck,
  ShieldCheck,
  LineChart,
  Megaphone,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import '../assets/css/TutorSidebar.css';
import { getTutorProfile, getExercisesWithAttempts } from '../services/tutorService';
import { usePortalBasePath } from '../hooks/usePortalBasePath';
import { useAuth } from '../hooks/useAuth';

const LogoMark = () => (
  <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="sidebar-logo__mark">
    <path d="M16 3L27.3 9.5V22.5L16 29L4.7 22.5V9.5Z" stroke="#fbbf24" strokeWidth="1.6" strokeLinejoin="round"/>
    <polyline points="10,21 16,13.5 22,21" stroke="#fbbf24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

interface TutorSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

const AcademicCapIcon = ({ size = 20 }: { size?: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    width={size}
    height={size}
    className="w-5 h-5 shrink-0"
    aria-hidden
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5"
    />
  </svg>
);

const TutorSidebar: React.FC<TutorSidebarProps> = ({ isOpen, onToggle }) => {
  const basePath = usePortalBasePath();
  const { user } = useAuth();
  const [specialization, setSpecialization] = useState<string>('Loading...');
  const [hasPendingGrading, setHasPendingGrading] = useState(false);
  const [loadingGrading, setLoadingGrading] = useState(true);

  useEffect(() => {
    const fetchSpecialization = async () => {
      try {
        const profile = await getTutorProfile();
        setSpecialization(
          profile.specialization && profile.specialization.length > 0
            ? profile.specialization.join(', ')
            : 'No specialization set'
        );
      } catch {
        setSpecialization('Aviation Cybersecurity');
      }
    };
    fetchSpecialization();

    // Check if there are any exercises with submissions (pending grading)
    const checkPendingGrading = async () => {
      try {
        const exercises = await getExercisesWithAttempts();
        setHasPendingGrading(exercises.some(ex => ex.attempts_count > 0));
      } catch {
        setHasPendingGrading(false);
      } finally {
        setLoadingGrading(false);
      }
    };
    checkPendingGrading();
  }, []);

  const isAdmin = user?.role === 'admin';
  const adminBase = '/admin';

  const adminPortalItems = isAdmin
    ? [
        { id: 'admin-users', label: 'All Users', icon: Users, path: `${adminBase}/users` },
        { id: 'admin-supervisors', label: 'All Supervisors', icon: UserCheck, path: `${adminBase}/supervisors` },
        { id: 'admin-instructors', label: 'All Instructors', icon: GraduationCap, path: `${adminBase}/instructors` },
        { id: 'admin-admins', label: 'All Admins', icon: ShieldCheck, path: `${adminBase}/admins` },
        { id: 'admin-tutors', label: 'All Tutors', icon: Users, path: `${adminBase}/tutors` },
        { id: 'admin-courses', label: 'All Courses', icon: BookOpen, path: `${adminBase}/courses-list` },
        { id: 'admin-schedule', label: 'All Schedule', icon: Calendar, path: `${adminBase}/schedule-all` },
        { id: 'admin-logs', label: 'Admin Logs', icon: ScrollText, path: `${adminBase}/logs` },
        { id: 'admin-announcements', label: 'Announcements', icon: Megaphone, path: `${adminBase}/announcements` },
      ]
    : [];

  const tutorToolItems = [
    { id: 'materials', label: 'Materials', icon: Upload, path: `${basePath}/materials` },
    { id: 'course-builder', label: 'Course Builder', icon: AcademicCapIcon, path: `${basePath}/courses` },
    ...(user?.role === 'supervisor' || user?.role === 'admin'
      ? [{ id: 'scenarios', label: 'Scenarios', icon: Target, path: `${basePath}/scenarios` }]
      : []),
    { id: 'exercises', label: 'Exercises', icon: BookOpen, path: `${basePath}/exercises` },
    { id: 'schedule', label: 'Schedule', icon: Calendar, path: `${basePath}/schedule` },
    { id: 'students', label: 'Students', icon: Users, path: `${basePath}/students` },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, path: `${basePath}/analytics` },
    { id: 'reports', label: 'Reports', icon: FileText, path: `${basePath}/reports` },
    ...(user?.role === 'supervisor' || user?.role === 'admin' || user?.role === 'instructor'
      ? [{ id: 'announcements', label: 'Announcements', icon: Megaphone, path: `${basePath}/announcements` }]
      : []),
  ];

  const dashboardItem = isAdmin
    ? {
        id: 'admin-metrics',
        label: 'Metrics & Charts',
        icon: LineChart,
        path: `${adminBase}/metrics`,
      }
    : {
        id: 'dashboard',
        label: 'Dashboard',
        icon: Home,
        path: `${basePath}/dashboard`,
      };

  const teachingDashboardItem = isAdmin
    ? {
        id: 'teaching-dashboard',
        label: 'Teaching Dashboard',
        icon: Home,
        path: `${adminBase}/dashboard`,
      }
    : null;

  // Insert Grading item after Exercises only if there are pending submissions
  const allTutorToolItems = [...tutorToolItems];
  if (!loadingGrading && hasPendingGrading) {
    const exercisesIndex = allTutorToolItems.findIndex(item => item.id === 'exercises');
    if (exercisesIndex !== -1) {
      allTutorToolItems.splice(exercisesIndex + 1, 0, {
        id: 'grading',
        label: 'Grading',
        icon: ClipboardCheck,
        path: `${basePath}/grading`,
      });
    }
  }

  type NavItem = {
    id: string;
    label: string;
    icon: React.ComponentType<{ size?: number }>;
    path: string;
  };

  const renderNavItem = (item: NavItem) => (
    <li key={item.id}>
      <NavLink
        to={item.path}
        end={
          item.id === 'dashboard' ||
          item.id === 'admin-metrics' ||
          item.id === 'teaching-dashboard'
        }
        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
      >
        <item.icon size={20} />
        <span>{item.label}</span>
        {item.id === 'materials' && <span className="nav-badge">New</span>}
        {item.id === 'grading' && hasPendingGrading && (
          <span className="nav-badge grading-badge">!</span>
        )}
      </NavLink>
    </li>
  );

  return (
    <>
      <div className={`sidebar-overlay ${isOpen ? 'active' : ''}`} onClick={onToggle} />
      <aside className={`tutor-sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <LogoMark />
            <span className="sidebar-logo__text">
              SkyShield <span>{isAdmin ? 'Admin' : 'Tutor'}</span>
            </span>
          </div>
        </div>

        <div className="specialization-badge">
          <span className="badge-label">Specialization:</span>
          <span className="badge-value">{specialization}</span>
        </div>

        <nav className="sidebar-nav">
          <ul className="nav-menu">
            {renderNavItem(dashboardItem)}
            {isAdmin && (
              <>
                <li className="nav-section-label">Platform management</li>
                {adminPortalItems.map(renderNavItem)}
                {teachingDashboardItem && renderNavItem(teachingDashboardItem)}
                <li className="nav-section-label">Teaching tools</li>
              </>
            )}
            {allTutorToolItems.map(renderNavItem)}
          </ul>
        </nav>

        <div className="sidebar-footer">
          <p className="sidebar-version">
            v1.2.3 • {isAdmin ? 'Admin Portal' : 'Tutor Portal'}
          </p>
        </div>
      </aside>
    </>
  );
};

export default TutorSidebar;