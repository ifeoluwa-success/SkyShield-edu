import React, { useState } from 'react';
import { Calendar, RefreshCw, Video } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import AdminPageShell from '../../components/admin/AdminPageShell';
import AdminPaginationBar from '../../components/admin/AdminPaginationBar';
import { PageLoader } from '../../components/ui/Loading';
import {
  useAdminScheduleMeetingsQuery,
  useAdminScheduleSessionsQuery,
} from '../../hooks/useAdminPortal';
import { adminKeys } from '../../lib/adminQueryKeys';

type ScheduleRow = Record<string, unknown>;

const fmt = (v: unknown) => {
  if (!v || typeof v !== 'string') return '—';
  return new Date(v).toLocaleString();
};

const AdminSchedulePage: React.FC = () => {
  const qc = useQueryClient();
  const [upcomingOnly, setUpcomingOnly] = useState(true);
  const [sessionPage, setSessionPage] = useState(1);
  const [meetingPage, setMeetingPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const sessionQuery = useAdminScheduleSessionsQuery({
    upcoming: upcomingOnly,
    page: sessionPage,
    page_size: pageSize,
  });
  const meetingQuery = useAdminScheduleMeetingsQuery({
    upcoming: upcomingOnly,
    page: meetingPage,
    page_size: pageSize,
  });

  const sessions = (sessionQuery.data?.results ?? []) as ScheduleRow[];
  const meetings = (meetingQuery.data?.results ?? []) as ScheduleRow[];

  const refresh = () => {
    qc.invalidateQueries({ queryKey: [...adminKeys.all, 'scheduleSessions'] });
    qc.invalidateQueries({ queryKey: [...adminKeys.all, 'scheduleMeetings'] });
    sessionQuery.refetch();
    meetingQuery.refetch();
  };

  return (
    <AdminPageShell
      title="All schedule"
      subtitle="Teaching sessions and meetings (paginated)"
      toast={toast}
      onCloseToast={() => setToast(null)}
      actions={
        <>
          <label className="filter-button" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={upcomingOnly}
              onChange={e => {
                setUpcomingOnly(e.target.checked);
                setSessionPage(1);
                setMeetingPage(1);
              }}
              style={{ marginRight: 6 }}
            />
            Upcoming only
          </label>
          <button type="button" className="filter-button" onClick={refresh}>
            <RefreshCw size={16} /> Refresh
          </button>
        </>
      }
    >
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-header">
            <div className="stat-icon blue">
              <Calendar size={24} />
            </div>
          </div>
          <div className="stat-content">
            <h3 className="stat-value">{(sessionQuery.data?.count ?? 0).toLocaleString()}</h3>
            <p className="stat-title">Teaching sessions</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-header">
            <div className="stat-icon purple">
              <Video size={24} />
            </div>
          </div>
          <div className="stat-content">
            <h3 className="stat-value">{(meetingQuery.data?.count ?? 0).toLocaleString()}</h3>
            <p className="stat-title">Meetings</p>
          </div>
        </div>
      </div>

      <section className="content-card schedule-section">
        <h3>Teaching sessions</h3>
        <div className="table-container">
          {sessionQuery.isLoading && !sessionQuery.data ? (
            <PageLoader message="Loading sessions…" className="min-h-0 py-8" />
          ) : sessions.length === 0 ? (
            <div className="empty-state">No teaching sessions</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Tutor</th>
                  <th>Platform</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => (
                  <tr key={String(s.id)}>
                    <td>{String(s.title ?? '')}</td>
                    <td>{String(s.tutor_name ?? '')}</td>
                    <td>{String(s.platform ?? '')}</td>
                    <td>{fmt(s.start_time)}</td>
                    <td>{fmt(s.end_time)}</td>
                    <td>
                      <span className={`status-pill ${String(s.status ?? '')}`}>
                        {String(s.status ?? '—')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {sessionQuery.data && (
          <AdminPaginationBar
            count={sessionQuery.data.count}
            page={sessionPage}
            pageSize={pageSize}
            hasNext={!!sessionQuery.data.next}
            hasPrevious={!!sessionQuery.data.previous}
            onPrev={() => setSessionPage(p => Math.max(1, p - 1))}
            onNext={() => setSessionPage(p => p + 1)}
            onPageSizeChange={size => {
              setPageSize(size);
              setSessionPage(1);
              setMeetingPage(1);
            }}
          />
        )}
      </section>

      <section className="content-card schedule-section">
        <h3>Meetings</h3>
        <div className="table-container">
          {meetingQuery.isLoading && !meetingQuery.data ? (
            <PageLoader message="Loading meetings…" className="min-h-0 py-8" />
          ) : meetings.length === 0 ? (
            <div className="empty-state">No meetings</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Host</th>
                  <th>Code</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {meetings.map(m => (
                  <tr key={String(m.id)}>
                    <td>{String(m.title ?? '')}</td>
                    <td>{String(m.host_name ?? '')}</td>
                    <td>{String(m.meeting_code ?? '')}</td>
                    <td>{fmt(m.scheduled_start)}</td>
                    <td>{fmt(m.scheduled_end)}</td>
                    <td>
                      <span className={`status-pill ${String(m.status ?? '')}`}>
                        {String(m.status ?? '—')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {meetingQuery.data && (
          <AdminPaginationBar
            count={meetingQuery.data.count}
            page={meetingPage}
            pageSize={pageSize}
            hasNext={!!meetingQuery.data.next}
            hasPrevious={!!meetingQuery.data.previous}
            onPrev={() => setMeetingPage(p => Math.max(1, p - 1))}
            onNext={() => setMeetingPage(p => p + 1)}
          />
        )}
      </section>
    </AdminPageShell>
  );
};

export default AdminSchedulePage;
