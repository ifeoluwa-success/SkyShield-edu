import React, { Suspense, useState } from 'react';
import { Outlet } from 'react-router-dom';
import DashboardHeader from './DashboardHeader';
import DashboardSidebar from './DashboardSidebar';
import { RouteFallback } from './ui/RouteFallback';
import '../assets/css/DashboardLayout.css';

interface DashboardLayoutProps {
  children?: React.ReactNode;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const toggleSidebar = () => setSidebarOpen((o) => !o);

  return (
    <div className="dashboard-layout">
      <DashboardSidebar isOpen={sidebarOpen} onToggle={toggleSidebar} />
      <div className="dashboard-main">
        <DashboardHeader onMobileToggle={toggleSidebar} />
        <main className="dashboard-content">
          <Suspense fallback={<RouteFallback />}>{children ?? <Outlet />}</Suspense>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
