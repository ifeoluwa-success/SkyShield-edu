import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Bell, CheckCheck, MessageSquare, Award, Calendar } from 'lucide-react';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type BackendNotification,
} from '../services/authService';
import { useAuth } from '../hooks/useAuth';
import '../assets/css/NotificationPanel.css';
import { Spinner } from './ui/Loading';

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onUnreadCountChange?: (count: number) => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function mapType(n: BackendNotification): 'info' | 'meeting' | 'content' | 'graded' {
  const t = (n.notification_type ?? n.type ?? '').toLowerCase();
  if (t.includes('meet')) return 'meeting';
  if (t.includes('grade') || t.includes('score') || t.includes('award')) return 'graded';
  if (t.includes('content') || t.includes('material') || t.includes('upload')) return 'content';
  return 'info';
}

const NotificationPanel: React.FC<NotificationPanelProps> = ({ isOpen, onClose, onUnreadCountChange }) => {
  const { isAuthenticated, token } = useAuth();
  const [notifications, setNotifications] = useState<BackendNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [unreadCount, onUnreadCountChange]);

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setSessionExpired(true);
      setNotifications([]);
      return;
    }
    setLoading(true);
    setError(false);
    setSessionExpired(false);
    try {
      const data = await getNotifications();
      setNotifications(data);
    } catch {
      const stillAuthed = Boolean(localStorage.getItem('access_token')?.trim());
      if (!stillAuthed) {
        setSessionExpired(true);
      } else {
        setError(true);
      }
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, token]);

  useEffect(() => {
    if (isOpen) void fetchNotifications();
  }, [isOpen, fetchNotifications]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const handleMarkRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    try {
      await markNotificationRead(id);
    } catch {
      // optimistic update is fine to keep
    }
  };

  const handleMarkAllRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    try {
      await markAllNotificationsRead();
    } catch {
      // optimistic update is fine to keep
    }
  };

  const getIcon = (n: BackendNotification) => {
    switch (mapType(n)) {
      case 'meeting': return <Calendar size={18} />;
      case 'content': return <MessageSquare size={18} />;
      case 'graded': return <Award size={18} />;
      default: return <Bell size={18} />;
    }
  };

  const drawer = (
    <>
      {isOpen && (
        <div className="notification-overlay" onClick={onClose} role="presentation" aria-hidden={!isOpen} />
      )}
      <div
        className={`notification-panel ${isOpen ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
        aria-hidden={!isOpen}
      >
        <div className="panel-header">
          <div className="header-title">
            <Bell size={20} />
            <h3>Notifications</h3>
            {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="panel-actions">
          {unreadCount > 0 && (
            <button className="mark-all-btn" onClick={handleMarkAllRead}>
              <CheckCheck size={16} />
              <span>Mark all as read</span>
            </button>
          )}
        </div>

        <div className="notifications-list">
          {loading ? (
            <div className="empty-state">
              <Spinner size="lg" />
              <p>Loading notifications…</p>
            </div>
          ) : sessionExpired ? (
            <div className="empty-state">
              <Bell size={40} />
              <p>Your session expired. Sign in again to see notifications.</p>
            </div>
          ) : error ? (
            <div className="empty-state">
              <Bell size={40} />
              <p>Couldn't load notifications</p>
              <button className="mark-all-btn" onClick={() => void fetchNotifications()} style={{ marginTop: '0.5rem' }}>
                Retry
              </button>
            </div>
          ) : notifications.length === 0 ? (
            <div className="empty-state">
              <Bell size={40} />
              <p>No notifications yet</p>
            </div>
          ) : (
            notifications.map(n => (
              <div
                key={n.id}
                className={`notification-item ${!n.is_read ? 'unread' : ''}`}
                onClick={() => !n.is_read && handleMarkRead(n.id)}
              >
                <div className={`notification-icon ${mapType(n)}`}>
                  {getIcon(n)}
                </div>
                <div className="notification-content">
                  <div className="notification-title">{n.title}</div>
                  <div className="notification-message">{n.message}</div>
                  <div className="notification-time">{timeAgo(n.created_at)}</div>
                </div>
                {!n.is_read && <div className="unread-dot" />}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(drawer, document.body);
};

export default NotificationPanel;
