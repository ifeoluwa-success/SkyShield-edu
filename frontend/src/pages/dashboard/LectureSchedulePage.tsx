// src/pages/dashboard/LectureSchedulePage.tsx
import {
  Calendar as CalendarIcon,
  CheckCircle,
  Clock,
  Link as LinkIcon,
  Mail,
  PlayCircle,
  PlusCircle,
  Users,
  Video,
  X,
  XCircle,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../../assets/css/LectureSchedulePage.css';
import { showToast } from '../../lib/toast';
import { PageLoader, Spinner } from '../../components/ui/Loading';
import {
  getInvitations,
  acceptInvitation,
  declineInvitation,
  type MeetingInvitation,
} from '../../services/contentService';
import { getMyUpcomingSessions, type UpcomingSession } from '../../services/simulationService';

const LectureSchedulePage: React.FC = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<UpcomingSession[]>([]);
  const [invitations, setInvitations] = useState<MeetingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinInput, setJoinInput] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        setLoading(true);
        const [sessionsData, invitesData] = await Promise.allSettled([
          getMyUpcomingSessions(),
          getInvitations(),
        ]);
        if (sessionsData.status === 'fulfilled') setSessions(sessionsData.value);
        if (invitesData.status === 'fulfilled') {
          setInvitations(invitesData.value.filter(i => i.status === 'pending'));
        }
      } catch {
        showToast({ type: 'error', message: 'Failed to load lecture schedule' });
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const handleAccept = async (inv: MeetingInvitation) => {
    setRespondingId(inv.id);
    try {
      await acceptInvitation(inv.id);
      setInvitations(prev => prev.filter(i => i.id !== inv.id));
      showToast({ type: 'success', message: `Accepted — joining ${inv.meeting.title}` });
      navigate(`/meetings/join/${inv.meeting.meeting_code}`);
    } catch {
      showToast({ type: 'error', message: 'Failed to accept invitation' });
    } finally {
      setRespondingId(null);
    }
  };

  const handleDecline = async (id: string) => {
    setRespondingId(id);
    try {
      await declineInvitation(id);
      setInvitations(prev => prev.filter(i => i.id !== id));
      showToast({ type: 'info', message: 'Invitation declined' });
    } catch {
      showToast({ type: 'error', message: 'Failed to decline invitation' });
    } finally {
      setRespondingId(null);
    }
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const handleJoinWithCode = () => {
    let code = joinInput.trim();
    if (!code) {
      showToast({ type: 'error', message: 'Please enter a meeting code or link' });
      return;
    }
    // Extract code from full URL if user pasted a link
    const match = code.match(/\/meetings\/join\/([a-zA-Z0-9]+)/);
    if (match) {
      code = match[1];
    }
    setJoining(true);
    // Navigate directly – the meeting room will handle validation
    navigate(`/meetings/join/${code}`);
    setShowJoinModal(false);
    setJoinInput('');
    setJoining(false);
  };

  if (loading) {
    return (
      <div className="lecture-schedule-page loading">
        <PageLoader message="Loading schedule…" className="min-h-0 py-12" />
      </div>
    );
  }

  return (
    <div className="lecture-schedule-page">
{/* Join Meeting Modal */}
      {showJoinModal && (
        <div className="modal-overlay" onClick={() => setShowJoinModal(false)}>
          <div className="join-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Join a Meeting</h3>
              <button className="modal-close" onClick={() => setShowJoinModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <p>Enter the meeting code or full link provided by the host.</p>
              <input
                type="text"
                className="join-input"
                placeholder="e.g., abc123xyz or https://skyshield.com/meetings/join/abc123xyz"
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleJoinWithCode()}
                autoFocus
              />
              <button
                className="join-submit-btn"
                onClick={handleJoinWithCode}
                disabled={joining}
              >
                {joining ? <Spinner size="sm" /> : <PlayCircle size={18} />}
                Join Meeting
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="page-header">
        <div className="header-left">
          <h1 className="page-title">Lecture Schedule</h1>
          <p className="page-subtitle">Join your live classes and instructor sessions</p>
        </div>
        <button className="join-meeting-btn" onClick={() => setShowJoinModal(true)}>
          <PlusCircle size={20} />
          <span>Join Meeting</span>
        </button>
      </div>

      {/* ── Pending Invitations ── */}
      {invitations.length > 0 && (
        <div className="invitations-section">
          <div className="invitations-header">
            <Mail size={18} />
            <h2>Meeting Invitations</h2>
            <span className="invitations-badge">{invitations.length}</span>
          </div>
          <div className="invitations-list">
            {invitations.map(inv => {
              const busy = respondingId === inv.id;
              const start = new Date(inv.meeting.scheduled_start);
              return (
                <div key={inv.id} className="invitation-card">
                  <div className="invitation-info">
                    <p className="invitation-title">{inv.meeting.title}</p>
                    <div className="invitation-meta">
                      <span><CalendarIcon size={13} /> {start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                      <span><Clock size={13} /> {start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                      {inv.inviter_name && <span><Users size={13} /> {inv.inviter_name}</span>}
                    </div>
                  </div>
                  <div className="invitation-actions">
                    <button
                      className="inv-accept-btn"
                      onClick={() => handleAccept(inv)}
                      disabled={busy}
                    >
                      {busy ? <Spinner size="xs" /> : <CheckCircle size={15} />}
                      Accept
                    </button>
                    <button
                      className="inv-decline-btn"
                      onClick={() => handleDecline(inv.id)}
                      disabled={busy}
                    >
                      <XCircle size={15} />
                      Decline
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="empty-state">
          <CalendarIcon size={48} />
          <p>No upcoming lectures scheduled. Check back later!</p>
          <button className="empty-join-btn" onClick={() => setShowJoinModal(true)}>
            <LinkIcon size={16} /> Join a meeting with code
          </button>
        </div>
      ) : (
        <div className="sessions-grid">
          {sessions.map((session) => (
            <div key={session.id} className="session-card">
              <div className="session-header">
                <div className="session-icon"><Video size={24} /></div>
                <div className="session-meta">
                  <span className="session-type">{session.session_type || 'Live Class'}</span>
                  <span className="session-status scheduled">Scheduled</span>
                </div>
              </div>
              <div className="session-content">
                <h3>{session.title}</h3>
                <p className="session-description">{session.description}</p>
                <div className="session-details">
                  <div className="detail">
                    <CalendarIcon size={14} />
                    <span>{formatDate(session.start_time)}</span>
                  </div>
                  <div className="detail">
                    <Clock size={14} />
                    <span>Duration: {session.duration_minutes || 60} min</span>
                  </div>
                  <div className="detail">
                    <Users size={14} />
                    <span>Max {session.max_attendees || 50} participants</span>
                  </div>
                </div>
              </div>
              <div className="session-footer">
                {session.join_link ? (
                  <a href={session.join_link} target="_blank" rel="noopener noreferrer" className="join-btn">
                    <PlayCircle size={18} /> Join Now
                  </a>
                ) : (
                  <button className="join-btn disabled" disabled>Link coming soon</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LectureSchedulePage;