// src/pages/tutor/TutorSchedulePage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Video,
  Users,
  Clock,
  ExternalLink,
  Edit,
  Trash2,
  CheckCircle,
  Link as LinkIcon,
  Bell,
  Play,
  Square,
  Mail,
  Film,
  X,
} from 'lucide-react';
import {
  getTeachingSessions,
  deleteTeachingSession,
  getMeetings,
  deleteMeeting,
  startMeeting,
  endMeeting,
  inviteToMeeting,
  cancelSession,
  addRecordingToSession,
  requestMeetingRecording,
} from '../../services/tutorService';
import type { TeachingSession, Meeting, ScheduleItem } from '../../types/tutor';
import { getStartTime, getEndTime, getJoinLink, getRecordingUrl } from '../../types/tutor';
import { showToast } from '../../lib/toast';
import { PageLoader } from '../../components/ui/Loading';
import ScheduleMeetingModal from '../../components/ScheduleMeetingModal';
import ScheduleSessionModal from '../../components/ScheduleSessionModal';
import ConfirmationModal from '../../components/ConfirmationModal';
import '../../assets/css/TutorSchedulePage.css';

const TutorSchedulePage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [upcomingSessions, setUpcomingSessions] = useState<TeachingSession[]>([]);
  const [pastSessions, setPastSessions] = useState<TeachingSession[]>([]);
  const [upcomingMeetings, setUpcomingMeetings] = useState<Meeting[]>([]);
  const [pastMeetings, setPastMeetings] = useState<Meeting[]>([]);
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);

  // Invite modal
  const [inviteModal, setInviteModal] = useState<{ meetingId: string; emails: string } | null>(null);
  const [inviting, setInviting] = useState(false);

  // Cancel session modal
  const [cancelModal, setCancelModal] = useState<{ sessionId: string; reason: string } | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Add recording modal
  const [recordingModal, setRecordingModal] = useState<{ itemId: string; itemType: 'session' | 'meeting'; url: string } | null>(null);
  const [addingRecording, setAddingRecording] = useState(false);
  const [requestingRecordingId, setRequestingRecordingId] = useState<string | null>(null);

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const fetchSessions = useCallback(async () => {
    try {
      const [upcoming, past] = await Promise.all([
        getTeachingSessions({ status: 'upcoming' }),
        getTeachingSessions({ status: 'ended' }),
      ]);
      setUpcomingSessions(upcoming);
      setPastSessions(past);
    } catch {
      showToast({ type: 'error', message: 'Failed to load teaching sessions' });
    }
  }, []);

  const fetchMeetings = useCallback(async () => {
    try {
      const [upcoming, past] = await Promise.all([
        getMeetings({ status: 'scheduled' }),
        getMeetings({ status: 'ended' }),
      ]);
      setUpcomingMeetings(upcoming);
      setPastMeetings(past);
    } catch {
      showToast({ type: 'error', message: 'Failed to load meetings' });
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchSessions(), fetchMeetings()]);
      setLoading(false);
    };
    loadData();
  }, [fetchSessions, fetchMeetings]);

  const handleDeleteSession = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Teaching Session',
      message: 'Are you sure you want to delete this teaching session? This action cannot be undone.',
      onConfirm: async () => {
        try {
          await deleteTeachingSession(id);
          showToast({ type: 'success', message: 'Session deleted' });
          await fetchSessions();
        } catch {
          showToast({ type: 'error', message: 'Failed to delete session' });
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  const handleDeleteMeeting = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Meeting',
      message: 'Are you sure you want to delete this meeting? This action cannot be undone.',
      onConfirm: async () => {
        try {
          await deleteMeeting(id);
          showToast({ type: 'success', message: 'Meeting deleted' });
          await fetchMeetings();
        } catch {
          showToast({ type: 'error', message: 'Failed to delete meeting' });
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  const handleStartMeeting = async (id: string) => {
    try {
      const updated = await startMeeting(id);
      setUpcomingMeetings(prev => prev.map(m => (m.id === updated.id ? updated : m)));
      showToast({ type: 'success', message: 'Meeting started' });
    } catch {
      showToast({ type: 'error', message: 'Failed to start meeting' });
    }
  };

  const handleEndMeeting = async (id: string) => {
    try {
      const updated = await endMeeting(id);
      setUpcomingMeetings(prev => prev.filter(m => m.id !== updated.id));
      await fetchMeetings();
      showToast({ type: 'success', message: 'Meeting ended' });
    } catch {
      showToast({ type: 'error', message: 'Failed to end meeting' });
    }
  };

  const handleInvite = async () => {
    if (!inviteModal) return;
    const emails = inviteModal.emails.split(',').map(e => e.trim()).filter(Boolean);
    if (emails.length === 0) return;
    setInviting(true);
    try {
      await inviteToMeeting(inviteModal.meetingId, emails);
      showToast({ type: 'success', message: `Invitation sent to ${emails.length} recipient(s)` });
      setInviteModal(null);
    } catch {
      showToast({ type: 'error', message: 'Failed to send invitations' });
    } finally {
      setInviting(false);
    }
  };

  const handleCancelSession = async () => {
    if (!cancelModal) return;
    setCancelling(true);
    try {
      await cancelSession(cancelModal.sessionId, cancelModal.reason);
      showToast({ type: 'success', message: 'Session cancelled' });
      setCancelModal(null);
      await fetchSessions();
    } catch {
      showToast({ type: 'error', message: 'Failed to cancel session' });
    } finally {
      setCancelling(false);
    }
  };

  const handleRequestRecording = async (meetingId: string) => {
    setRequestingRecordingId(meetingId);
    try {
      await requestMeetingRecording(meetingId);
      showToast({ type: 'success', message: 'Recording request sent' });
    } catch {
      showToast({ type: 'error', message: 'Failed to request recording' });
    } finally {
      setRequestingRecordingId(null);
    }
  };

  const handleAddRecording = async () => {
    if (!recordingModal || !recordingModal.url.trim()) return;
    setAddingRecording(true);
    try {
      if (recordingModal.itemType === 'session') {
        await addRecordingToSession(recordingModal.itemId, recordingModal.url);
      }
      showToast({ type: 'success', message: 'Recording added' });
      setRecordingModal(null);
      await fetchSessions();
    } catch {
      showToast({ type: 'error', message: 'Failed to add recording' });
    } finally {
      setAddingRecording(false);
    }
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

  const formatTimeRange = (start: string, end: string) => {
    const fmt = (d: string) =>
      new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${fmt(start)} – ${fmt(end)}`;
  };

  const combinedUpcoming: ScheduleItem[] = [
    ...upcomingSessions.map(s => ({ ...s, type: 'session' as const })),
    ...upcomingMeetings.map(m => ({ ...m, type: 'meeting' as const })),
  ].sort((a, b) => new Date(getStartTime(a)).getTime() - new Date(getStartTime(b)).getTime());

  const combinedPast: ScheduleItem[] = [
    ...pastSessions.map(s => ({ ...s, type: 'session' as const })),
    ...pastMeetings.map(m => ({ ...m, type: 'meeting' as const })),
  ].sort((a, b) => new Date(getStartTime(b)).getTime() - new Date(getStartTime(a)).getTime());

  if (loading) {
    return (
      <div className="tutor-schedule-page loading">
        <PageLoader message="Loading schedule…" className="min-h-0 py-12" />
      </div>
    );
  }

  return (
    <div className="tutor-schedule-page">
<div className="page-header">
        <div className="header-content">
          <h1 className="page-title">Schedule &amp; Sessions</h1>
          <p className="page-subtitle">Manage your lectures, workshops, and meetings</p>
        </div>
        <div className="header-buttons">
          <button className="schedule-button" onClick={() => setShowMeetingModal(true)}>
            <Video size={20} />
            <span>Internal Meeting</span>
          </button>
          <button className="schedule-button secondary" onClick={() => setShowSessionModal(true)}>
            <Calendar size={20} />
            <span>Teaching Session</span>
          </button>
        </div>
      </div>

      {/* Mini Calendar */}
      <div className="calendar-section">
        <div className="calendar-header">
          <h3>{new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</h3>
        </div>
        <div className="calendar-grid">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
            <div key={day} className="calendar-day-header">{day}</div>
          ))}
          {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
            <div key={day} className={`calendar-day${day === new Date().getDate() ? ' today' : ''}`}>
              <span className="day-number">{day}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Upcoming */}
      <section className="sessions-section">
        <h3>Upcoming</h3>
        <div className="sessions-grid">
          {combinedUpcoming.length === 0 ? (
            <div className="empty-state">No upcoming sessions or meetings</div>
          ) : (
            combinedUpcoming.map(item => (
              <div key={`${item.type}-${item.id}`} className="session-card">
                <div className="session-header">
                  <div className="session-icon"><Video size={24} /></div>
                  <div className="session-actions">
                    <button className="icon-btn"><Edit size={16} /></button>
                    {item.type === 'session' && (
                      <button
                        className="icon-btn cancel"
                        title="Cancel session"
                        onClick={() => setCancelModal({ sessionId: item.id, reason: '' })}
                      >
                        <X size={16} />
                      </button>
                    )}
                    <button
                      className="icon-btn delete"
                      onClick={() =>
                        item.type === 'session'
                          ? handleDeleteSession(item.id)
                          : handleDeleteMeeting(item.id)
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="session-content">
                  <h4>{item.title}</h4>
                  <p className="session-description">{item.description}</p>
                  <div className="session-details">
                    <div className="detail"><Calendar size={14} /><span>{formatDate(getStartTime(item))}</span></div>
                    <div className="detail"><Clock size={14} /><span>{formatTimeRange(getStartTime(item), getEndTime(item))}</span></div>
                    <div className="detail"><Users size={14} /><span>
                      {item.type === 'session'
                        ? `${item.current_attendees ?? 0} / ${item.max_attendees ?? 0} attendees`
                        : `${item.participant_count ?? 0} / ${item.max_participants ?? 0} participants`}
                    </span></div>
                    <div className="detail"><LinkIcon size={14} /><span>
                      {item.type === 'session'
                        ? (item.platform || 'External')
                        : item.meeting_type === 'internal' ? 'Internal Meeting' : item.meeting_type}
                    </span></div>
                  </div>
                  <div className="session-status">
                    <span className={`status ${item.status}`}>
                      {item.status === 'confirmed' || item.status === 'scheduled' ? (
                        <><CheckCircle size={12} /> Scheduled</>
                      ) : item.status === 'in_progress' ? (
                        <><Play size={12} /> Live</>
                      ) : item.status}
                    </span>
                  </div>
                </div>
                <div className="session-footer">
                  {item.type === 'meeting' && item.status !== 'live' && item.status !== 'in_progress' && (
                    <button className="start-btn" onClick={() => handleStartMeeting(item.id)}>
                      <Play size={14} /> Start
                    </button>
                  )}
                  {item.type === 'meeting' && (item.status === 'live' || item.status === 'in_progress') && (
                    <>
                      <button className="end-btn" onClick={() => handleEndMeeting(item.id)}>
                        <Square size={14} /> End
                      </button>
                      <button className="invite-btn" onClick={() => setInviteModal({ meetingId: item.id, emails: '' })}>
                        <Mail size={14} /> Invite
                      </button>
                    </>
                  )}
                  {item.type === 'session' && getJoinLink(item) && (
                    <a href={getJoinLink(item)} target="_blank" rel="noopener noreferrer" className="join-link">
                      <ExternalLink size={16} /> Join Session
                    </a>
                  )}
                  {item.type === 'meeting' && getJoinLink(item) && (item.status === 'live' || item.status === 'in_progress') && (
                    <a href={getJoinLink(item)} rel="noopener noreferrer" className="join-link">
                      <ExternalLink size={16} /> Join
                    </a>
                  )}
                  <button className="reminder-btn"><Bell size={16} /> Remind</button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Past */}
      <section className="sessions-section">
        <h3>Past</h3>
        <div className="sessions-grid">
          {combinedPast.length === 0 ? (
            <div className="empty-state">No past sessions or meetings</div>
          ) : (
            combinedPast.map(item => (
              <div key={`${item.type}-${item.id}`} className="session-card past">
                <div className="session-header"><div className="session-icon"><Video size={24} /></div></div>
                <div className="session-content">
                  <h4>{item.title}</h4>
                  <p className="session-description">{item.description}</p>
                  <div className="session-details">
                    <div className="detail"><Calendar size={14} /><span>{formatDate(getStartTime(item))}</span></div>
                    <div className="detail"><Clock size={14} /><span>{formatTimeRange(getStartTime(item), getEndTime(item))}</span></div>
                    <div className="detail"><Users size={14} /><span>
                      {item.type === 'session' ? `${item.current_attendees ?? 0} attendees` : `${item.participant_count ?? 0} participants`}
                    </span></div>
                  </div>
                  <div className="session-status"><span className="status completed"><CheckCircle size={12} /> Completed</span></div>
                </div>
                <div className="session-footer">
                  {getRecordingUrl(item) ? (
                    <a href={getRecordingUrl(item)} target="_blank" rel="noopener noreferrer" className="review-btn">View Recording</a>
                  ) : (
                    <>
                      <button
                        className="review-btn"
                        onClick={() => setRecordingModal({ itemId: item.id, itemType: item.type, url: '' })}
                      >
                        <Film size={14} /> Add Recording
                      </button>
                      {item.type === 'meeting' && (
                        <button
                          className="review-btn secondary"
                          disabled={requestingRecordingId === item.id}
                          onClick={() => handleRequestRecording(item.id)}
                          title="Request the platform to generate a recording"
                        >
                          {requestingRecordingId === item.id ? 'Requesting…' : 'Request Recording'}
                        </button>
                      )}
                    </>
                  )}
                  <button className="stats-btn">View Statistics</button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Modals */}
      {showMeetingModal && (
        <ScheduleMeetingModal
          onClose={() => setShowMeetingModal(false)}
          onCreated={() => fetchMeetings()}
        />
      )}
      {showSessionModal && (
        <ScheduleSessionModal
          onClose={() => setShowSessionModal(false)}
          onCreated={() => fetchSessions()}
        />
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Invite Modal */}
      {inviteModal && (
        <div className="modal-overlay">
          <div className="action-modal">
            <div className="modal-header">
              <h3>Invite Participants</h3>
              <button className="icon-btn" onClick={() => setInviteModal(null)}><X size={18} /></button>
            </div>
            <p className="modal-desc">Enter email addresses separated by commas.</p>
            <textarea
              className="modal-textarea"
              rows={3}
              placeholder="alice@example.com, bob@example.com"
              value={inviteModal.emails}
              onChange={e => setInviteModal({ ...inviteModal, emails: e.target.value })}
            />
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setInviteModal(null)}>Cancel</button>
              <button className="submit-btn" onClick={handleInvite} disabled={inviting}>
                {inviting ? 'Sending…' : 'Send Invites'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Session Modal */}
      {cancelModal && (
        <div className="modal-overlay">
          <div className="action-modal">
            <div className="modal-header">
              <h3>Cancel Session</h3>
              <button className="icon-btn" onClick={() => setCancelModal(null)}><X size={18} /></button>
            </div>
            <p className="modal-desc">Optionally provide a reason for cancellation.</p>
            <textarea
              className="modal-textarea"
              rows={3}
              placeholder="Reason for cancellation (optional)"
              value={cancelModal.reason}
              onChange={e => setCancelModal({ ...cancelModal, reason: e.target.value })}
            />
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setCancelModal(null)}>Back</button>
              <button className="submit-btn danger" onClick={handleCancelSession} disabled={cancelling}>
                {cancelling ? 'Cancelling…' : 'Cancel Session'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Recording Modal */}
      {recordingModal && (
        <div className="modal-overlay">
          <div className="action-modal">
            <div className="modal-header">
              <h3>Add Recording URL</h3>
              <button className="icon-btn" onClick={() => setRecordingModal(null)}><X size={18} /></button>
            </div>
            <p className="modal-desc">Paste the URL of the session recording.</p>
            <input
              className="modal-input"
              type="url"
              placeholder="https://drive.google.com/..."
              value={recordingModal.url}
              onChange={e => setRecordingModal({ ...recordingModal, url: e.target.value })}
            />
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setRecordingModal(null)}>Cancel</button>
              <button className="submit-btn" onClick={handleAddRecording} disabled={addingRecording}>
                {addingRecording ? 'Saving…' : 'Save Recording'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TutorSchedulePage;