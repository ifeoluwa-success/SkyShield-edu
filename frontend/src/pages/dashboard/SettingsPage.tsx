import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { updateProfile } from '../../services/authService';
import { Bell } from 'lucide-react';
import { showToast } from '../../lib/toast';
import SuccessModal from '../../components/SuccessModal';
import TwoFactorSettings from '../../components/TwoFactorSettings';
import '../../assets/css/SettingsPage.css';

const SettingsPage: React.FC = () => {
  const { user, updateUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [successModal, setSuccessModal] = useState<{ title: string; message: string } | null>(null);
  const [notifications, setNotifications] = useState(user?.email_notifications ?? true);

  useEffect(() => {
    if (user) setNotifications(user.email_notifications);
  }, [user]);

  const handleNotificationToggle = async () => {
    setLoading(true);
    try {
      const updated = await updateProfile({ email_notifications: !notifications });
      updateUser(updated);
      setNotifications(!notifications);
      setSuccessModal({
        title: 'Notifications Updated',
        message: `Email notifications are now ${!notifications ? 'enabled' : 'disabled'}.`,
      });
    } catch {
      showToast({ type: 'error', message: 'Failed to update preference.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="settings-page">
      {successModal && (
        <SuccessModal isOpen onClose={() => setSuccessModal(null)} title={successModal.title} message={successModal.message} />
      )}

      <div className="page-header">
        <h1>Account Settings</h1>
        <p>Manage your account preferences and security</p>
      </div>

      <div className="settings-grid">
        <div className="settings-card">
          <div className="card-header">
            <Bell size={20} />
            <h2>Email Notifications</h2>
          </div>
          <div className="card-content">
            <p>Receive updates about your simulations, achievements, and platform news.</p>
            <label className="toggle-switch">
              <input type="checkbox" checked={notifications} onChange={handleNotificationToggle} disabled={loading} />
              <span className="slider"></span>
              <span className="toggle-label">{notifications ? 'Enabled' : 'Disabled'}</span>
            </label>
          </div>
        </div>

        <TwoFactorSettings />
      </div>
    </div>
  );
};

export default SettingsPage;
