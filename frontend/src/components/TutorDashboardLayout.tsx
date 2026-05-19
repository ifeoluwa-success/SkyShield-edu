import React, { Suspense, useState } from 'react';
import { Outlet } from 'react-router-dom';
import TutorSidebar from './TutorSidebar';
import DashboardHeader from './DashboardHeader';
import { RouteFallback } from './ui/RouteFallback';
import '../assets/css/TutorDashboardLayout.css';

const TutorDashboardLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const toggleSidebar = () => setSidebarOpen((o) => !o);

  return (
    <div className="tutor-dashboard-layout">
      <TutorSidebar isOpen={sidebarOpen} onToggle={toggleSidebar} />
      <div className="tutor-main-content">
        <DashboardHeader onMobileToggle={toggleSidebar} />
        <main className="tutor-content-area">
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
};

export default TutorDashboardLayout;
