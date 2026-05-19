// src/pages/tutor/TutorSettingsPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { updateProfile } from '../../services/authService';
import {
  getDevices, trustDevice, untrustDevice, removeDevice,
  getActiveSessions, terminateSession, terminateOtherSessions,
  type UserDevice, type UserSession,
} from '../../services/authService';
import { Bell, Shield, Smartphone, Monitor, LogOut, Trash2, CheckCircle } from 'lucide-react';
import Toast from '../../components/Toast';
import { Spinner } from '../../components/ui/Loading';
import SuccessModal from '../../components/SuccessModal';
import '../../assets/css/SettingsPage.css';

type AlertType = 'success' | 'error' | 'info';

function toDisplayText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const s = value.trim();
    return s.length > 0 ? s : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object' && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    for (const key of ['browser', 'name', 'label', 'value', 'os', 'version', 'device']) {
      const inner = o[key];
      if (typeof inner === 'string' && inner.trim()) return inner.trim();
    }
  }
  return null;
}

const TutorSettingsPage: React.FC = () => {
  const { user, updateUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: AlertType; message: string } | null>(null);
  const [successModal, setSuccessModal] = useState<{ title: string; message: string } | null>(null);
  const [notifications, setNotifications] = useState(user?.email_notifications ?? true);

  const [devices, setDevices] = useState<UserDevice[]>([]);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [togglingDevice, setTogglingDevice] = useState<string | null>(null);
  const [terminatingSession, setTerminatingSession] = useState<string | null>(null);

  useEffect(() => {
    if (user) setNotifications(user.email_notifications);
  }, [user]);

  const fetchDevices = useCallback(async () => {
    setDevicesLoading(true);
    try { setDevices(await getDevices()); } catch { /* ignore */ } finally { setDevicesLoading(false); }
  }, []);

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true);
    try { setSessions(await getActiveSessions()); } catch { /* ignore */ } finally { setSessionsLoading(false); }
  }, []);

  useEffect(() => { fetchDevices(); fetchSessions(); }, [fetchDevices, fetchSessions]);

  const handleNotificationToggle = async () => {
    setLoading(true);
    try {
      const updated = await updateProfile({ email_notifications: !notifications });
      updateUser(updated);
      setNotifications(!notifications);
      setSuccessModal({ title: 'Notifications Updated', message: `Email notifications are now ${!notifications ? 'enabled' : 'disabled'}.` });
    } catch {
      setToast({ type: 'error', message: 'Failed to update preference.' });
    } finally {
      setLoading(false);
    }
  };

  const handleTrustToggle = async (device: UserDevice) => {
    setTogglingDevice(device.id);
    try {
      if (device.is_trusted) await untrustDevice(device.id);
      else await trustDevice(device.id);
      setDevices(prev => prev.map(d => (d.id === device.id ? { ...d, is_trusted: !d.is_trusted } : d)));
      setToast({ type: 'success', message: device.is_trusted ? 'Device untrusted' : 'Device trusted' });
    } catch {
      setToast({ type: 'error', message: 'Failed to update device trust' });
    } finally { setTogglingDevice(null); }
  };

  const handleRemoveDevice = async (id: string) => {
    if (!window.confirm('Remove this device?')) return;
    try {
      await removeDevice(id);
      setDevices(prev => prev.filter(d => d.id !== id));
      setToast({ type: 'success', message: 'Device removed' });
    } catch { setToast({ type: 'error', message: 'Failed to remove device' }); }
  };

  const handleTerminateSession = async (id: string) => {
    setTerminatingSession(id);
    try {
      await terminateSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      setToast({ type: 'success', message: 'Session terminated' });
    } catch { setToast({ type: 'error', message: 'Failed to terminate session' }); }
    finally { setTerminatingSession(null); }
  };

  const handleTerminateAll = async () => {
    if (!window.confirm('Sign out of all other devices?')) return;
    try { await terminateOtherSessions(); await fetchSessions(); setToast({ type: 'success', message: 'All other sessions terminated' }); }
    catch { setToast({ type: 'error', message: 'Failed to terminate sessions' }); }
  };

  const fmtDate = (s: string) =>
    new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="settings-page">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {successModal && <SuccessModal isOpen onClose={() => setSuccessModal(null)} title={successModal.title} message={successModal.message} />}

      <div className="page-header">
        <h1>Account Settings</h1>
        <p>Manage your account preferences and security</p>
      </div>

      <div className="settings-grid">
        <div className="settings-card">
          <div className="card-header"><Bell size={20} /><h2>Email Notifications</h2></div>
          <div className="card-content">
            <p>Receive updates about student activities, meeting reminders, and platform news.</p>
            <label className="toggle-switch">
              <input type="checkbox" checked={notifications} onChange={handleNotificationToggle} disabled={loading} />
              <span className="slider"></span>
              <span className="toggle-label">{notifications ? 'Enabled' : 'Disabled'}</span>
            </label>
          </div>
        </div>

        <div className="settings-card">
          <div className="card-header"><Shield size={20} /><h2>Two-Factor Authentication</h2></div>
          <div className="card-content">
            <p>Add an extra layer of security to your account.</p>
            <button onClick={() => setToast({ type: 'info', message: 'Two-factor authentication setup is coming soon.' })} className="btn-secondary">
              {user?.two_factor_enabled ? 'Manage 2FA' : 'Enable 2FA'}
            </button>
          </div>
        </div>

        <div className="settings-card full-width">
          <div className="card-header"><Smartphone size={20} /><h2>Connected Devices</h2></div>
          <div className="card-content">
            {devicesLoading ? (
              <div className="settings-loading"><Spinner size="md" /> Loading devices…</div>
            ) : devices.length === 0 ? (
              <p className="settings-empty">No devices registered yet.</p>
            ) : (
              <div className="devices-list">
                {devices.map(device => (
                  <div key={device.id} className="device-row">
                    <div className="device-icon"><Monitor size={20} /></div>
                    <div className="device-info">
                      <span className="device-name">{device.device_name || device.device_type || 'Unknown device'}</span>
                      <span className="device-meta">{[device.browser, device.os, device.ip_address].filter(Boolean).join(' · ')}</span>
                      {device.last_used && <span className="device-meta">Last used {fmtDate(device.last_used)}</span>}
                    </div>
                    <div className="device-actions">
                      {device.is_trusted && <span className="trusted-badge"><CheckCircle size={12} /> Trusted</span>}
                      <button className={`btn-xs ${device.is_trusted ? 'btn-danger' : 'btn-secondary'}`} onClick={() => handleTrustToggle(device)} disabled={togglingDevice === device.id}>
                        {togglingDevice === device.id ? <Spinner size="xs" /> : (device.is_trusted ? 'Untrust' : 'Trust')}
                      </button>
                      <button className="btn-xs btn-danger" onClick={() => handleRemoveDevice(device.id)}><Trash2 size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="settings-card full-width">
          <div className="card-header between">
            <div className="card-header-left"><LogOut size={20} /><h2>Active Sessions</h2></div>
            {sessions.length > 1 && <button className="btn-secondary btn-sm" onClick={handleTerminateAll}>Sign out all others</button>}
          </div>
          <div className="card-content">
            {sessionsLoading ? (
              <div className="settings-loading"><Spinner size="md" /> Loading sessions…</div>
            ) : sessions.length === 0 ? (
              <p className="settings-empty">No active sessions found.</p>
            ) : (
              <div className="devices-list">
                {sessions.map(session => (
                  <div key={session.id} className="device-row">
                    <div className="device-icon"><Monitor size={20} /></div>
                    <div className="device-info">
                      <span className="device-name">
                        {[toDisplayText(session.browser), toDisplayText(session.os)]
                          .filter(Boolean)
                          .join(' on ') ||
                          toDisplayText(session.device_info) ||
                          'Unknown device'}
                      </span>
                      <span className="device-meta">{session.ip_address && `IP: ${session.ip_address} · `}Signed in {fmtDate(session.login_time)}</span>
                    </div>
                    <div className="device-actions">
                      <button className="btn-xs btn-danger" onClick={() => handleTerminateSession(session.id)} disabled={terminatingSession === session.id}>
                        {terminatingSession === session.id ? <Spinner size="xs" /> : 'Sign out'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TutorSettingsPage;
