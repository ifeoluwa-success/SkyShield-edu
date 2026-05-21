import React, { useState } from 'react';
import { RefreshCw, FileWarning, Shield } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import AdminPageShell from '../../components/admin/AdminPageShell';
import AdminPaginationBar from '../../components/admin/AdminPaginationBar';
import { PageLoader } from '../../components/ui/Loading';
import { useAdminLogsQuery } from '../../hooks/useAdminPortal';
import { adminKeys } from '../../lib/adminQueryKeys';

type LogTab = 'audit' | 'error' | 'api';

const TAB_LABELS: Record<LogTab, string> = {
  audit: 'Audit log',
  error: 'Error log',
  api: 'API log',
};

type LogRow = Record<string, unknown>;

const AdminLogsPage: React.FC = () => {
  const qc = useQueryClient();
  const [tab, setTab] = useState<LogTab>('audit');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const { data, isLoading, refetch } = useAdminLogsQuery(tab, { page, page_size: pageSize });

  const rows = (data?.results ?? []) as LogRow[];

  return (
    <AdminPageShell
      title="Admin logs"
      subtitle="Audit, error, and API request logs (paginated)"
      toast={toast}
      onCloseToast={() => setToast(null)}
      actions={
        <button
          type="button"
          className="filter-button"
          onClick={() => {
            qc.invalidateQueries({ queryKey: [...adminKeys.all, 'logs'] });
            refetch();
          }}
        >
          <RefreshCw size={16} /> Refresh
        </button>
      }
    >
      <div className="role-tabs log-tabs">
        {(Object.keys(TAB_LABELS) as LogTab[]).map(key => (
          <button
            key={key}
            type="button"
            className={`role-tab ${tab === key ? 'active' : ''}`}
            onClick={() => {
              setTab(key);
              setPage(1);
            }}
          >
            {TAB_LABELS[key]}
          </button>
        ))}
      </div>

      <div className="content-card schedule-section">
        <h3>
          {tab === 'error' && <FileWarning size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />}
          {tab === 'audit' && <Shield size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />}
          {TAB_LABELS[tab]}
        </h3>
        <div className="table-container">
          {isLoading && !data ? (
            <PageLoader message="Loading logs…" className="min-h-0 py-12" />
          ) : rows.length === 0 ? (
            <div className="empty-state">No log entries</div>
          ) : tab === 'audit' ? (
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Model</th>
                  <th>Object</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={String(row.id ?? i)}>
                    <td>{String(row.timestamp ?? '').slice(0, 19)}</td>
                    <td>{String(row.user_email ?? '—')}</td>
                    <td>{String(row.action ?? '')}</td>
                    <td>
                      {String(row.app_name ?? '')}.{String(row.model_name ?? '')}
                    </td>
                    <td className="log-preview">{String(row.object_repr ?? '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : tab === 'error' ? (
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Level</th>
                  <th>Message</th>
                  <th>Path</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={String(row.id ?? i)}>
                    <td>{String(row.created_at ?? '').slice(0, 19)}</td>
                    <td>{String(row.level ?? '')}</td>
                    <td className="log-preview">{String(row.message ?? '')}</td>
                    <td className="log-preview">{String(row.url ?? '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Method</th>
                  <th>Path</th>
                  <th>Status</th>
                  <th>Ms</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={String(row.id ?? i)}>
                    <td>{String(row.timestamp ?? '').slice(0, 19)}</td>
                    <td>{String(row.method ?? '')}</td>
                    <td className="log-preview">{String(row.path ?? '')}</td>
                    <td>{String(row.response_status ?? '')}</td>
                    <td>{String(row.execution_time ?? '')}</td>
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

export default AdminLogsPage;
