import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Plus, RefreshCw } from 'lucide-react';
import AdminPageShell from '../../components/admin/AdminPageShell';
import DatePicker from '../../components/ui/DatePicker';
import { PageLoader } from '../../components/ui/Loading';
import {
  createAnnouncement,
  listManageAnnouncements,
  updateAnnouncement,
  type Announcement,
  type AnnouncementPayload,
} from '../../services/contentService';

const PRIORITIES: AnnouncementPayload['priority'][] = ['low', 'medium', 'high', 'urgent'];

const ROLE_OPTIONS = [
  { value: 'trainee', label: 'Trainees' },
  { value: 'instructor', label: 'Instructors' },
  { value: 'supervisor', label: 'Supervisors' },
  { value: 'admin', label: 'Admins' },
];

const emptyForm = (): AnnouncementPayload => ({
  title: '',
  content: '',
  priority: 'medium',
  target_roles: [],
  is_active: true,
});

const AdminAnnouncementsPage: React.FC = () => {
  const qc = useQueryClient();
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(
    null,
  );
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AnnouncementPayload>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: items = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['announcements', 'manage'],
    queryFn: listManageAnnouncements,
    staleTime: 60_000,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingId) return updateAnnouncement(editingId, form);
      return createAnnouncement(form);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['announcements'] });
      setToast({
        type: 'success',
        message: editingId ? 'Announcement updated' : 'Announcement published',
      });
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm());
    },
    onError: () => setToast({ type: 'error', message: 'Failed to save announcement' }),
  });

  const startEdit = (a: Announcement) => {
    setEditingId(a.id);
    setForm({
      title: a.title,
      content: a.content,
      priority: a.priority,
      target_roles: a.target_roles ?? [],
      publish_from: a.publish_from ?? undefined,
      publish_until: a.publish_until ?? null,
      is_active: a.is_active ?? true,
    });
    setShowForm(true);
  };

  const toggleActive = async (a: Announcement) => {
    try {
      await updateAnnouncement(a.id, { is_active: !a.is_active });
      qc.invalidateQueries({ queryKey: ['announcements'] });
      setToast({ type: 'success', message: a.is_active ? 'Announcement deactivated' : 'Announcement activated' });
    } catch {
      setToast({ type: 'error', message: 'Failed to update status' });
    }
  };

  const toggleRole = (role: string) => {
    setForm(prev => {
      const roles = prev.target_roles ?? [];
      return {
        ...prev,
        target_roles: roles.includes(role) ? roles.filter(r => r !== role) : [...roles, role],
      };
    });
  };

  return (
    <AdminPageShell
      title="Announcements"
      subtitle="Create and manage platform-wide notices shown on the learning hub"
      toast={toast}
      onCloseToast={() => setToast(null)}
      actions={
        <>
          <button type="button" className="filter-button" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={16} /> Refresh
          </button>
          <button
            type="button"
            className="filter-button primary"
            onClick={() => {
              setEditingId(null);
              setForm(emptyForm());
              setShowForm(true);
            }}
          >
            <Plus size={16} /> New announcement
          </button>
        </>
      }
    >
      {showForm && (
        <div className="admin-card announcement-form-card">
          <h2>{editingId ? 'Edit announcement' : 'New announcement'}</h2>
          <div className="announcement-form-grid">
            <label>
              Title
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Scheduled maintenance"
              />
            </label>
            <label>
              Priority
              <select
                value={form.priority}
                onChange={e =>
                  setForm(f => ({ ...f, priority: e.target.value as AnnouncementPayload['priority'] }))
                }
              >
                {PRIORITIES.map(p => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="full-width">
              Message
              <textarea
                rows={4}
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder="What should users know?"
              />
            </label>
            <fieldset className="full-width role-targets">
              <legend>Target roles (leave empty = everyone)</legend>
              <div className="role-checkboxes">
                {ROLE_OPTIONS.map(r => (
                  <label key={r.value} className="role-check">
                    <input
                      type="checkbox"
                      checked={(form.target_roles ?? []).includes(r.value)}
                      onChange={() => toggleRole(r.value)}
                    />
                    {r.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="announcement-dates-row">
              <DatePicker
                label="Publish from (optional)"
                placeholder="Starts immediately if empty"
                value={form.publish_from ?? null}
                onChange={iso => setForm(f => ({ ...f, publish_from: iso ?? undefined }))}
                showTime
                clearable
              />
              <DatePicker
                label="Publish until (optional)"
                placeholder="No end date"
                value={form.publish_until ?? null}
                onChange={iso => setForm(f => ({ ...f, publish_until: iso }))}
                showTime
                clearable
                minDate={form.publish_from ? new Date(form.publish_from) : undefined}
              />
            </div>
            <label className="active-toggle">
              <input
                type="checkbox"
                checked={form.is_active !== false}
                onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
              />
              Active
            </label>
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="filter-button"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="filter-button primary"
              disabled={!form.title.trim() || !form.content.trim() || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? 'Saving…' : editingId ? 'Save changes' : 'Publish'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <PageLoader message="Loading announcements…" className="min-h-0 py-12" />
      ) : items.length === 0 ? (
        <div className="admin-empty">
          <Megaphone size={40} />
          <p>No announcements yet. Create one to notify trainees and staff.</p>
        </div>
      ) : (
        <div className="students-table-container">
          <table className="students-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Priority</th>
                <th>Targets</th>
                <th>Status</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map(a => (
                <tr key={a.id}>
                  <td>
                    <strong>{a.title}</strong>
                    <div className="cell-muted">{a.content.slice(0, 80)}…</div>
                  </td>
                  <td>
                    <span className={`priority-pill priority-${a.priority}`}>{a.priority}</span>
                  </td>
                  <td>
                    {(a.target_roles?.length ?? 0) === 0
                      ? 'All roles'
                      : a.target_roles?.join(', ')}
                  </td>
                  <td>{a.is_active ? 'Active' : 'Inactive'}</td>
                  <td>{new Date(a.created_at).toLocaleDateString()}</td>
                  <td className="actions-cell">
                    <button type="button" className="link-btn" onClick={() => startEdit(a)}>
                      Edit
                    </button>
                    <button type="button" className="link-btn" onClick={() => toggleActive(a)}>
                      {a.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminPageShell>
  );
};

export default AdminAnnouncementsPage;
