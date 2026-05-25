import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Search, RefreshCw, Users, Mail } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import AdminPageShell from '../../components/admin/AdminPageShell';
import AdminPaginationBar from '../../components/admin/AdminPaginationBar';
import { PageLoader } from '../../components/ui/Loading';
import { useAdminUsersQuery, useAdminUserStatusMutation } from '../../hooks/useAdminPortal';
import type { UserStatus } from '../../services/adminPortalService';
import { adminKeys } from '../../lib/adminQueryKeys';
import { showToast } from '../../lib/toast';
import {
  PAGE_META,
  TAB_LABELS,
  userTabFromPathname,
  type UserTab,
} from './adminUserPageConfig';

const STATUS_OPTIONS: { value: UserStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'pending', label: 'Pending' },
];

const AdminUsersPage: React.FC = () => {
  const { pathname } = useLocation();
  const qc = useQueryClient();
  const fixedTab = userTabFromPathname(pathname);
  const meta = PAGE_META[fixedTab ?? 'all'];

  const [tab, setTab] = useState<UserTab>(fixedTab ?? 'all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const activeTab = fixedTab ?? tab;

  useEffect(() => {
    if (fixedTab) setTab(fixedTab);
  }, [fixedTab]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, debouncedSearch, pageSize]);

  const { data, isLoading, isFetching, refetch } = useAdminUsersQuery(activeTab, {
    search: debouncedSearch || undefined,
    page,
    page_size: pageSize,
  });

  const statusMutation = useAdminUserStatusMutation();

  const handleStatusChange = async (userId: string, status: UserStatus) => {
    setUpdatingId(userId);
    try {
      await statusMutation.mutateAsync({ userId, status });
      showToast({ type: 'success', message: `User status updated to ${status}` });
    } catch {
      showToast({ type: 'error', message: 'Failed to update user status' });
    } finally {
      setUpdatingId(null);
    }
  };

  const results = data?.results ?? [];
  const showRoleTabs = !fixedTab;

  return (
    <AdminPageShell
      title={meta.title}
      subtitle={meta.subtitle}
      actions={
        <button
          type="button"
          className="filter-button"
          onClick={() => {
            qc.invalidateQueries({ queryKey: [...adminKeys.all, 'users'] });
            refetch();
          }}
        >
          <RefreshCw size={16} className={isFetching ? 'spin' : ''} /> Refresh
        </button>
      }
    >
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-header">
            <div className="stat-icon blue">
              <Users size={24} />
            </div>
          </div>
          <div className="stat-content">
            <h3 className="stat-value">{(data?.count ?? 0).toLocaleString()}</h3>
            <p className="stat-title">{TAB_LABELS[activeTab]}</p>
          </div>
        </div>
      </div>

      {showRoleTabs ? (
        <div className="role-tabs">
          {(Object.keys(TAB_LABELS) as UserTab[]).map(key => (
            <button
              key={key}
              type="button"
              className={`role-tab ${tab === key ? 'active' : ''}`}
              onClick={() => setTab(key)}
            >
              {TAB_LABELS[key]}
            </button>
          ))}
        </div>
      ) : (
        <nav className="quick-links">
          <Link to="/admin/users" className="quick-link">
            All users
          </Link>
          <Link to="/admin/supervisors" className="quick-link">
            Supervisors
          </Link>
          <Link to="/admin/instructors" className="quick-link">
            Instructors
          </Link>
          <Link to="/admin/admins" className="quick-link">
            Admins
          </Link>
        </nav>
      )}

      <div className="content-card">
        <div className="search-filter-bar">
          <div className="search-box">
            <Search size={18} />
            <input
              type="search"
              placeholder="Search by name or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="table-container">
          {isLoading && !data ? (
            <PageLoader message="Loading users…" className="min-h-0 py-12" />
          ) : results.length === 0 ? (
            <div className="empty-state">No users found</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Department</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {results.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div className="student-info">
                        <div className="avatar">{(u.full_name || u.email).charAt(0).toUpperCase()}</div>
                        <span>{u.full_name || u.username}</span>
                      </div>
                    </td>
                    <td>
                      <div className="contact-item">
                        <Mail size={14} />
                        <span>{u.email}</span>
                      </div>
                    </td>
                    <td>{u.role}</td>
                    <td>
                      <select
                        className="admin-status-select"
                        value={u.status}
                        disabled={updatingId === u.id}
                        onChange={e => handleStatusChange(u.id, e.target.value as UserStatus)}
                        aria-label={`Status for ${u.email}`}
                      >
                        {STATUS_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{u.department || '—'}</td>
                    <td>{new Date(u.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {data && (
          <AdminPaginationBar
            count={data.count}
            page={page}
            pageSize={pageSize}
            hasNext={!!data.next}
            hasPrevious={!!data.previous}
            onPrev={() => setPage(p => Math.max(1, p - 1))}
            onNext={() => setPage(p => p + 1)}
            onPageSizeChange={size => {
              setPageSize(size);
              setPage(1);
            }}
          />
        )}
      </div>
    </AdminPageShell>
  );
};

export default AdminUsersPage;
