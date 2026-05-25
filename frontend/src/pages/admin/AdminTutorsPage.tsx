import React, { useEffect, useState } from 'react';
import { Search, RefreshCw, GraduationCap } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import AdminPageShell from '../../components/admin/AdminPageShell';
import AdminPaginationBar from '../../components/admin/AdminPaginationBar';
import { PageLoader } from '../../components/ui/Loading';
import { useAdminTutorsQuery } from '../../hooks/useAdminPortal';
import { adminKeys } from '../../lib/adminQueryKeys';

const AdminTutorsPage: React.FC = () => {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, pageSize]);

  const { data, isLoading, refetch } = useAdminTutorsQuery({
    search: debouncedSearch || undefined,
    page,
    page_size: pageSize,
  });

  const results = data?.results ?? [];

  return (
    <AdminPageShell
      title="All tutors"
      subtitle="Staff with tutor profiles"
      actions={
        <button
          type="button"
          className="filter-button"
          onClick={() => {
            qc.invalidateQueries({ queryKey: [...adminKeys.all, 'tutors'] });
            refetch();
          }}
        >
          <RefreshCw size={16} /> Refresh
        </button>
      }
    >
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-header">
            <div className="stat-icon green">
              <GraduationCap size={24} />
            </div>
          </div>
          <div className="stat-content">
            <h3 className="stat-value">{(data?.count ?? 0).toLocaleString()}</h3>
            <p className="stat-title">Tutor profiles</p>
          </div>
        </div>
      </div>

      <div className="content-card">
        <div className="search-filter-bar">
          <div className="search-box">
            <Search size={18} />
            <input
              type="search"
              placeholder="Search tutors…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="table-container">
          {isLoading && !data ? (
            <PageLoader message="Loading tutors…" className="min-h-0 py-12" />
          ) : results.length === 0 ? (
            <div className="empty-state">No tutor profiles found</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Students</th>
                  <th>Sessions</th>
                  <th>Meetings</th>
                  <th>Rating</th>
                </tr>
              </thead>
              <tbody>
                {results.map(t => (
                  <tr key={t.user_id}>
                    <td>{t.full_name}</td>
                    <td>{t.email}</td>
                    <td>{t.role}</td>
                    <td>
                      <span className={`status-pill ${t.status}`}>{t.status}</span>
                    </td>
                    <td>{t.total_students}</td>
                    <td>{t.total_sessions}</td>
                    <td>{t.total_meetings}</td>
                    <td>{t.average_rating.toFixed(1)}</td>
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

export default AdminTutorsPage;
