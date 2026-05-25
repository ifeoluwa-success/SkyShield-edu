import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, RefreshCw, BookOpen } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import AdminPageShell from '../../components/admin/AdminPageShell';
import AdminPaginationBar from '../../components/admin/AdminPaginationBar';
import { PageLoader } from '../../components/ui/Loading';
import { useAdminCoursesQuery } from '../../hooks/useAdminPortal';
import { adminKeys } from '../../lib/adminQueryKeys';

const AdminCoursesPage: React.FC = () => {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [publishedFilter, setPublishedFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, publishedFilter, pageSize]);

  const { data, isLoading, isFetching, refetch } = useAdminCoursesQuery({
    search: debouncedSearch || undefined,
    is_published: publishedFilter === 'all' ? undefined : publishedFilter === 'yes',
    page,
    page_size: pageSize,
  });

  const results = data?.results ?? [];

  return (
    <AdminPageShell
      title="All courses"
      subtitle="Structured courses on the platform (published and draft)"
      actions={
        <button
          type="button"
          className="filter-button"
          onClick={() => {
            qc.invalidateQueries({ queryKey: [...adminKeys.all, 'courses'] });
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
            <div className="stat-icon purple">
              <BookOpen size={24} />
            </div>
          </div>
          <div className="stat-content">
            <h3 className="stat-value">{(data?.count ?? 0).toLocaleString()}</h3>
            <p className="stat-title">Total courses</p>
          </div>
        </div>
      </div>

      <div className="content-card">
        <div className="search-filter-bar">
          <div className="search-box">
            <Search size={18} />
            <input
              type="search"
              placeholder="Search courses…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className="admin-filter-select"
            value={publishedFilter}
            onChange={e => setPublishedFilter(e.target.value as 'all' | 'yes' | 'no')}
          >
            <option value="all">All</option>
            <option value="yes">Published only</option>
            <option value="no">Draft only</option>
          </select>
        </div>

        <div className="table-container">
          {isLoading && !data ? (
            <PageLoader message="Loading courses…" className="min-h-0 py-12" />
          ) : results.length === 0 ? (
            <div className="empty-state">No courses found</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Level</th>
                  <th>Status</th>
                  <th>Modules</th>
                  <th>Enrollments</th>
                  <th>Author</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {results.map(c => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.title}</strong>
                      <div className="log-preview">{c.threat_focus}</div>
                    </td>
                    <td>{c.difficulty_label}</td>
                    <td>
                      <span className={`status-pill ${c.is_published ? 'published' : 'draft'}`}>
                        {c.is_published ? 'Published' : 'Draft'}
                      </span>
                    </td>
                    <td>{c.module_count}</td>
                    <td>{c.enrollment_count}</td>
                    <td>{c.created_by_email ?? '—'}</td>
                    <td>{new Date(c.created_at).toLocaleDateString()}</td>
                    <td>
                      <Link to={`/admin/courses/${c.id}/enrollments`} className="action-button">
                        Enrollments
                      </Link>
                    </td>
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
      {isFetching && data && (
        <p className="log-preview" style={{ marginTop: 8 }}>
          Updating…
        </p>
      )}
    </AdminPageShell>
  );
};

export default AdminCoursesPage;
