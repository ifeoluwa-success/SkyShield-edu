// src/pages/tutor/TutorProfilePage.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import {
  uploadAvatar,
  updateUserProfile,
  changePassword,
  getTutorProfile,
  updateTutorProfile,
} from '../../services/tutorService';
import {
  User,
  Camera,
  Plus,
  X,
  Eye,
  EyeOff,
  Lock,
  UserCircle,
  Briefcase,
  Video,
} from 'lucide-react';
import Toast from '../../components/Toast';
import { Spinner } from '../../components/ui/Loading';
import SuccessModal from '../../components/SuccessModal';
import '../../assets/css/TutorProfilePage.css';

const TutorProfilePage: React.FC = () => {
  const { user: authUser, updateUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [successModal, setSuccessModal] = useState<{ title: string; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [userData, setUserData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    username: '',
    organization: '',
    department: '',
    phone_number: '',
    bio: '',
    date_of_birth: '',
    address: '',
  });

  const [tutorData, setTutorData] = useState({
    specialization: [] as string[],
    bio: '',
    qualifications: [] as string[],
    experience_years: 0,
    default_meeting_duration: 60,
    default_max_participants: 50,
    allow_recording: true,
    allow_chat: true,
    allow_screen_share: true,
  });

  const [newSpecialization, setNewSpecialization] = useState('');
  const [newQualification, setNewQualification] = useState('');
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
    const fetchProfile = async () => {
      try {
        const profile = await getTutorProfile();
        setUserData({
          first_name: profile.user.first_name || '',
          last_name: profile.user.last_name || '',
          email: profile.user.email || '',
          username: profile.user.username || '',
          organization: profile.user.organization || '',
          department: profile.user.department || '',
          phone_number: profile.user.phone_number || '',
          bio: profile.user.bio || '',
          date_of_birth: profile.user.date_of_birth || '',
          address: profile.user.address || '',
        });
        setTutorData({
          specialization: profile.specialization || [],
          bio: profile.bio || '',
          qualifications: profile.qualifications || [],
          experience_years: profile.experience_years || 0,
          default_meeting_duration: profile.default_meeting_duration || 60,
          default_max_participants: profile.default_max_participants || 50,
          allow_recording: profile.allow_recording,
          allow_chat: profile.allow_chat,
          allow_screen_share: profile.allow_screen_share,
        });
        setAvatarPreview(profile.user.profile_picture);
      } catch {
        setToast({ type: 'error', message: 'Failed to load profile data.' });
      }
    };
    fetchProfile();
  }, []);

  const handleUserChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setUserData({ ...userData, [e.target.name]: e.target.value });
  };

  const handleTutorChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setTutorData({ ...tutorData, [e.target.name]: e.target.value });
  };

  const handleAvatarClick = () => fileInputRef.current?.click();

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
    setAvatarLoading(true);
    try {
      const updatedUser = await uploadAvatar(file);
      updateUser(updatedUser);
      setToast({ type: 'success', message: 'Profile picture updated!' });
    } catch {
      setToast({ type: 'error', message: 'Failed to upload picture.' });
      setAvatarPreview(authUser?.profile_picture || null);
    } finally {
      setAvatarLoading(false);
    }
  };

  const addSpecialization = () => {
    const value = newSpecialization.trim();
    if (value && !tutorData.specialization.includes(value)) {
      setTutorData({ ...tutorData, specialization: [...tutorData.specialization, value] });
      setNewSpecialization('');
    }
  };

  const removeSpecialization = (item: string) => {
    setTutorData({
      ...tutorData,
      specialization: tutorData.specialization.filter((s) => s !== item),
    });
  };

  const addQualification = () => {
    const value = newQualification.trim();
    if (value && !tutorData.qualifications.includes(value)) {
      setTutorData({ ...tutorData, qualifications: [...tutorData.qualifications, value] });
      setNewQualification('');
    }
  };

  const removeQualification = (item: string) => {
    setTutorData({
      ...tutorData,
      qualifications: tutorData.qualifications.filter((q) => q !== item),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const updatedUser = await updateUserProfile({
        first_name: userData.first_name,
        last_name: userData.last_name,
        organization: userData.organization,
        department: userData.department,
        phone_number: userData.phone_number,
        bio: userData.bio,
        date_of_birth: userData.date_of_birth || undefined,
        address: userData.address,
      });

      const updatedTutor = await updateTutorProfile({
        specialization: tutorData.specialization,
        bio: tutorData.bio,
        qualifications: tutorData.qualifications,
        experience_years: tutorData.experience_years,
        default_meeting_duration: tutorData.default_meeting_duration,
        default_max_participants: tutorData.default_max_participants,
        allow_recording: tutorData.allow_recording,
        allow_chat: tutorData.allow_chat,
        allow_screen_share: tutorData.allow_screen_share,
      });

      setUserData({
        first_name: updatedUser.first_name,
        last_name: updatedUser.last_name,
        email: updatedUser.email,
        username: updatedUser.username,
        organization: updatedUser.organization,
        department: updatedUser.department,
        phone_number: updatedUser.phone_number,
        bio: updatedUser.bio,
        date_of_birth: updatedUser.date_of_birth || '',
        address: updatedUser.address,
      });

      setTutorData({
        specialization: updatedTutor.specialization,
        bio: updatedTutor.bio,
        qualifications: updatedTutor.qualifications,
        experience_years: updatedTutor.experience_years,
        default_meeting_duration: updatedTutor.default_meeting_duration,
        default_max_participants: updatedTutor.default_max_participants,
        allow_recording: updatedTutor.allow_recording,
        allow_chat: updatedTutor.allow_chat,
        allow_screen_share: updatedTutor.allow_screen_share,
      });

      updateUser(updatedUser);
      setSuccessModal({
        title: 'Profile Updated',
        message: 'Your profile has been successfully updated.',
      });
    } catch {
      setToast({ type: 'error', message: 'Failed to update profile.' });
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
    [userData.first_name, userData.last_name].filter(Boolean).join(' ') ||
    authUser?.full_name ||
    authUser?.email ||
    'User';

  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const specPreview =
    tutorData.specialization.length > 0
      ? tutorData.specialization.slice(0, 2).join(', ')
      : 'No specialization set';

  return (
    <div className="role-dashboard profile-page tutor-profile-page">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
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
            <h1 className="page-title">Tutor Profile</h1>
            <p className="page-subtitle">Manage your personal and professional information</p>
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
              disabled={avatarLoading}
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
                {avatarLoading ? <Spinner size="sm" /> : <Camera size={14} />}
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
            <p className="profile-email">{userData.email}</p>
            {authUser?.role && <span className="profile-role">{authUser.role}</span>}
            <p className="profile-spec-preview">{specPreview}</p>
          </div>

          <div className="profile-card profile-stats">
            <h3 className="stats-heading">Teaching stats</h3>
            <div className="teaching-stats-grid">
              <div className="teaching-stat">
                <span className="teaching-stat-value">{tutorData.experience_years}+</span>
                <span className="teaching-stat-label">Years</span>
              </div>
              <div className="teaching-stat">
                <span className="teaching-stat-value">{tutorData.specialization.length}</span>
                <span className="teaching-stat-label">Specializations</span>
              </div>
              <div className="teaching-stat">
                <span className="teaching-stat-value">{tutorData.qualifications.length}</span>
                <span className="teaching-stat-label">Qualifications</span>
              </div>
            </div>
          </div>
        </aside>

        <div className="profile-main">
          <form onSubmit={handleSubmit} className="profile-form-stack">
            <section className="profile-card">
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
                      value={userData.first_name}
                      onChange={handleUserChange}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="last_name">Last Name</label>
                    <input
                      id="last_name"
                      type="text"
                      name="last_name"
                      value={userData.last_name}
                      onChange={handleUserChange}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="email">Email</label>
                    <input id="email" type="email" value={userData.email} disabled readOnly />
                  </div>
                  <div className="form-group">
                    <label htmlFor="username">Username</label>
                    <input id="username" type="text" value={userData.username} disabled readOnly />
                  </div>
                  <div className="form-group">
                    <label htmlFor="organization">Organization</label>
                    <input
                      id="organization"
                      type="text"
                      name="organization"
                      value={userData.organization}
                      onChange={handleUserChange}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="department">Department</label>
                    <input
                      id="department"
                      type="text"
                      name="department"
                      value={userData.department}
                      onChange={handleUserChange}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="phone_number">Phone Number</label>
                    <input
                      id="phone_number"
                      type="tel"
                      name="phone_number"
                      value={userData.phone_number}
                      onChange={handleUserChange}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="date_of_birth">Date of Birth</label>
                    <input
                      id="date_of_birth"
                      type="date"
                      name="date_of_birth"
                      value={userData.date_of_birth}
                      onChange={handleUserChange}
                    />
                  </div>
                  <div className="form-group full-width">
                    <label htmlFor="address">Address</label>
                    <input
                      id="address"
                      type="text"
                      name="address"
                      value={userData.address}
                      onChange={handleUserChange}
                    />
                  </div>
                  <div className="form-group full-width">
                    <label htmlFor="user_bio">Bio</label>
                    <textarea
                      id="user_bio"
                      name="bio"
                      rows={3}
                      value={userData.bio}
                      onChange={handleUserChange}
                      placeholder="Tell us about yourself…"
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="profile-card">
              <div className="card-header">
                <Briefcase size={20} />
                <h2>Professional Information</h2>
              </div>
              <div className="card-body">
                <div className="form-grid">
                  <div className="form-group full-width">
                    <label htmlFor="tutor_bio">Tutor Bio</label>
                    <textarea
                      id="tutor_bio"
                      name="bio"
                      rows={4}
                      value={tutorData.bio}
                      onChange={handleTutorChange}
                      placeholder="Your teaching experience and expertise…"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="experience_years">Years of Experience</label>
                    <input
                      id="experience_years"
                      type="number"
                      name="experience_years"
                      value={tutorData.experience_years}
                      onChange={handleTutorChange}
                      min={0}
                    />
                  </div>
                  <div className="form-group full-width">
                    <label>Specializations</label>
                    <div className="tags-list">
                      {tutorData.specialization.map((spec) => (
                        <span key={spec} className="tag">
                          {spec}
                          <button type="button" onClick={() => removeSpecialization(spec)} aria-label={`Remove ${spec}`}>
                            <X size={14} />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="tag-add-row">
                      <input
                        type="text"
                        value={newSpecialization}
                        onChange={(e) => setNewSpecialization(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSpecialization())}
                        placeholder="Add specialization"
                      />
                      <button type="button" className="tag-add-btn" onClick={addSpecialization}>
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="form-group full-width">
                    <label>Qualifications</label>
                    <div className="tags-list">
                      {tutorData.qualifications.map((qual) => (
                        <span key={qual} className="tag">
                          {qual}
                          <button type="button" onClick={() => removeQualification(qual)} aria-label={`Remove ${qual}`}>
                            <X size={14} />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="tag-add-row">
                      <input
                        type="text"
                        value={newQualification}
                        onChange={(e) => setNewQualification(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addQualification())}
                        placeholder="Add qualification"
                      />
                      <button type="button" className="tag-add-btn" onClick={addQualification}>
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="profile-card">
              <div className="card-header">
                <Video size={20} />
                <h2>Meeting Preferences</h2>
              </div>
              <div className="card-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="default_meeting_duration">Default Duration (min)</label>
                    <input
                      id="default_meeting_duration"
                      type="number"
                      name="default_meeting_duration"
                      value={tutorData.default_meeting_duration}
                      onChange={handleTutorChange}
                      min={15}
                      step={15}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="default_max_participants">Max Participants</label>
                    <input
                      id="default_max_participants"
                      type="number"
                      name="default_max_participants"
                      value={tutorData.default_max_participants}
                      onChange={handleTutorChange}
                      min={1}
                      max={200}
                    />
                  </div>
                  <div className="form-group full-width">
                    <span className="field-label">Allowed features</span>
                    <div className="checkbox-group">
                      <label>
                        <input
                          type="checkbox"
                          checked={tutorData.allow_recording}
                          onChange={(e) => setTutorData({ ...tutorData, allow_recording: e.target.checked })}
                        />
                        Allow recording
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={tutorData.allow_chat}
                          onChange={(e) => setTutorData({ ...tutorData, allow_chat: e.target.checked })}
                        />
                        Allow chat
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={tutorData.allow_screen_share}
                          onChange={(e) =>
                            setTutorData({ ...tutorData, allow_screen_share: e.target.checked })
                          }
                        />
                        Allow screen sharing
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <div className="profile-card profile-save-bar">
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
                    onChange={(e) => setPasswordData({ ...passwordData, old_password: e.target.value })}
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
                    onChange={(e) => setPasswordData({ ...passwordData, new_password: e.target.value })}
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
                    onChange={(e) => setPasswordData({ ...passwordData, new_password2: e.target.value })}
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

export default TutorProfilePage;
