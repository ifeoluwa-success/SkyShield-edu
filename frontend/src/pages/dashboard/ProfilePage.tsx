import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { updateProfile, changePassword } from '../../services/authService';
import { User, Camera, Eye, EyeOff, Lock, UserCircle } from 'lucide-react';
import Toast from '../../components/Toast';
import SuccessModal from '../../components/SuccessModal';
import '../../assets/css/ProfilePage.css';

const ProfilePage: React.FC = () => {
  const { user, updateUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [successModal, setSuccessModal] = useState<{ title: string; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    username: '',
    organization: '',
    department: '',
    job_title: '',
    phone_number: '',
    bio: '',
    date_of_birth: '',
    address: '',
  });

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const [passwordData, setPasswordData] = useState({
    old_password: '',
    new_password: '',
    new_password2: '',
  });
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setFormData({
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        email: user.email || '',
        username: user.username || '',
        organization: user.organization || '',
        department: user.department || '',
        job_title: user.job_title || '',
        phone_number: user.phone_number || '',
        bio: user.bio || '',
        date_of_birth: user.date_of_birth || '',
        address: user.address || '',
      });
      if (user.profile_picture) {
        setAvatarPreview(user.profile_picture);
      }
    }
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
        setToast({ type: 'info', message: 'Avatar upload will be implemented soon.' });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const updated = await updateProfile({
        first_name: formData.first_name,
        last_name: formData.last_name,
        organization: formData.organization,
        department: formData.department,
        job_title: formData.job_title,
        phone_number: formData.phone_number,
        bio: formData.bio,
        date_of_birth: formData.date_of_birth,
        address: formData.address,
        email_notifications: true,
      });

      updateUser(updated);
      setSuccessModal({
        title: 'Profile Updated',
        message: 'Your profile has been successfully updated.',
      });
    } catch {
      setToast({ type: 'error', message: 'Failed to update profile. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordData.new_password !== passwordData.new_password2) {
      setToast({ type: 'error', message: 'New passwords do not match.' });
      return;
    }
    setPasswordLoading(true);
    try {
      await changePassword({
        old_password: passwordData.old_password,
        new_password: passwordData.new_password,
        new_password2: passwordData.new_password2,
      });
      setSuccessModal({
        title: 'Password Changed',
        message: 'Your password has been successfully changed.',
      });
      setPasswordData({ old_password: '', new_password: '', new_password2: '' });
    } catch {
      setToast({ type: 'error', message: 'Failed to change password. Check your old password.' });
    } finally {
      setPasswordLoading(false);
    }
  };

  const displayName =
    [formData.first_name, formData.last_name].filter(Boolean).join(' ') ||
    user?.full_name ||
    user?.email ||
    'User';

  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="role-dashboard profile-page">
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
      {successModal && (
        <SuccessModal
          isOpen
          onClose={() => setSuccessModal(null)}
          title={successModal.title}
          message={successModal.message}
        />
      )}

      <header className="page-header">
        <div className="header-content">
          <div>
            <h1 className="page-title">Profile Settings</h1>
            <p className="page-subtitle">
              Manage your personal information and account security
            </p>
          </div>
        </div>
      </header>

      <div className="profile-layout">
        <aside className="profile-aside">
          <div className="profile-card profile-identity">
            <button
              type="button"
              className="avatar-wrap"
              onClick={handleAvatarClick}
              aria-label="Change profile photo"
            >
              {avatarPreview ? (
                <img src={avatarPreview} alt={displayName} className="avatar-img" />
              ) : (
                <div className="avatar-placeholder" aria-hidden>
                  {initials || <User size={36} />}
                </div>
              )}
              <span className="avatar-edit">
                <Camera size={14} />
              </span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              className="sr-only"
              accept="image/*"
              onChange={handleAvatarChange}
            />
            <h2 className="profile-name">{displayName}</h2>
            <p className="profile-email">{formData.email}</p>
            {user?.role && <span className="profile-role">{user.role}</span>}
          </div>
        </aside>

        <div className="profile-main">
          <form onSubmit={handleSubmit} className="profile-card">
            <div className="card-header">
              <UserCircle size={20} />
              <h2>Personal Information</h2>
            </div>
            <div className="card-body">
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="first_name">First Name</label>
                  <input
                    id="first_name"
                    type="text"
                    name="first_name"
                    value={formData.first_name}
                    onChange={handleChange}
                    placeholder="John"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="last_name">Last Name</label>
                  <input
                    id="last_name"
                    type="text"
                    name="last_name"
                    value={formData.last_name}
                    onChange={handleChange}
                    placeholder="Doe"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="email">Email</label>
                  <input id="email" type="email" value={formData.email} disabled readOnly />
                </div>
                <div className="form-group">
                  <label htmlFor="username">Username</label>
                  <input id="username" type="text" value={formData.username} disabled readOnly />
                </div>
                <div className="form-group">
                  <label htmlFor="organization">Organization</label>
                  <input
                    id="organization"
                    type="text"
                    name="organization"
                    value={formData.organization}
                    onChange={handleChange}
                    placeholder="Company or institution"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="department">Department</label>
                  <input
                    id="department"
                    type="text"
                    name="department"
                    value={formData.department}
                    onChange={handleChange}
                    placeholder="e.g. IT, Security"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="job_title">Job Title</label>
                  <input
                    id="job_title"
                    type="text"
                    name="job_title"
                    value={formData.job_title}
                    onChange={handleChange}
                    placeholder="e.g. Security Analyst"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="phone_number">Phone Number</label>
                  <input
                    id="phone_number"
                    type="tel"
                    name="phone_number"
                    value={formData.phone_number}
                    onChange={handleChange}
                    placeholder="+1234567890"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="date_of_birth">Date of Birth</label>
                  <input
                    id="date_of_birth"
                    type="date"
                    name="date_of_birth"
                    value={formData.date_of_birth}
                    onChange={handleChange}
                  />
                </div>
                <div className="form-group full-width">
                  <label htmlFor="address">Address</label>
                  <input
                    id="address"
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    placeholder="Street, city, country"
                  />
                </div>
                <div className="form-group full-width">
                  <label htmlFor="bio">Bio</label>
                  <textarea
                    id="bio"
                    name="bio"
                    rows={4}
                    value={formData.bio}
                    onChange={handleChange}
                    placeholder="Tell us about yourself…"
                  />
                </div>
              </div>
            </div>
            <div className="card-footer">
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>

          <form onSubmit={handlePasswordChange} className="profile-card">
            <div className="card-header">
              <Lock size={20} />
              <h2>Change Password</h2>
            </div>
            <div className="card-body password-fields">
              <div className="form-group password-group">
                <label htmlFor="old_password">Current Password</label>
                <div className="password-input-wrapper">
                  <input
                    id="old_password"
                    type={showOldPassword ? 'text' : 'password'}
                    value={passwordData.old_password}
                    onChange={(e) =>
                      setPasswordData({ ...passwordData, old_password: e.target.value })
                    }
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowOldPassword(!showOldPassword)}
                    aria-label={showOldPassword ? 'Hide password' : 'Show password'}
                  >
                    {showOldPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div className="form-group password-group">
                <label htmlFor="new_password">New Password</label>
                <div className="password-input-wrapper">
                  <input
                    id="new_password"
                    type={showNewPassword ? 'text' : 'password'}
                    value={passwordData.new_password}
                    onChange={(e) =>
                      setPasswordData({ ...passwordData, new_password: e.target.value })
                    }
                    required
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                  >
                    {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div className="form-group password-group">
                <label htmlFor="new_password2">Confirm New Password</label>
                <div className="password-input-wrapper">
                  <input
                    id="new_password2"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={passwordData.new_password2}
                    onChange={(e) =>
                      setPasswordData({ ...passwordData, new_password2: e.target.value })
                    }
                    required
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>
            <div className="card-footer">
              <button type="submit" className="btn-secondary" disabled={passwordLoading}>
                {passwordLoading ? 'Changing…' : 'Change Password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
