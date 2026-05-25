import React from 'react';
import '../../assets/css/AdminPortal.css';

interface AdminPageShellProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

const AdminPageShell: React.FC<AdminPageShellProps> = ({
  title,
  subtitle,
  children,
  actions,
}) => (
  <div className="tutor-students-page admin-portal-page role-dashboard">
    <div className="page-header">
      <div className="header-content">
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">{subtitle}</p>
        </div>
        {actions && <div className="header-actions">{actions}</div>}
      </div>
    </div>
    {children}
  </div>
);

export default AdminPageShell;
