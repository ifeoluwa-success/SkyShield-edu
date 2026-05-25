import { 
  Calendar as CalendarIcon,
  Clock,
  Users,
  Video,
  BookOpen,
  Award,
  ChevronLeft,
  ChevronRight,
  Bell,
  PlayCircle,
  FileText,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMyUpcomingSessions, getAssignedExercises, type UpcomingSession, type AssignedExercise } from '../../services/simulationService';
import { showToast } from '../../lib/toast';
import { PageLoader } from '../../components/ui/Loading';
import '../../assets/css/CalendarPage.css';

interface CalendarEvent {
  id: string;
  title: string;
  type: 'training' | 'simulation' | 'meeting' | 'assessment' | 'certification';
  date: string;
  startTime: string;
  endTime: string;
  duration: string;
  status: 'scheduled' | 'in-progress' | 'completed' | 'cancelled';
  participants?: number;
  location: string;
  color: string;
  icon: React.ElementType;
  description: string;
  reminder: boolean;
  joinLink?: string;
  isMeeting?: boolean;
  isExercise?: boolean;
  exerciseId?: string;
}

const CalendarPage = () => {
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
useEffect(() => {
    const fetchEvents = async () => {
      try {
        setLoading(true);
        const [upcomingSessions, assignedExercises] = await Promise.all([
          getMyUpcomingSessions(),
          getAssignedExercises(),
        ]);

        const calendarEvents: CalendarEvent[] = [];

        // Add upcoming meetings / live sessions
        upcomingSessions.forEach((session: UpcomingSession) => {
          const startDate = new Date(session.start_time);
          const endDate = new Date(session.end_time);
          const durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
          const hours = Math.floor(durationMinutes / 60);
          const mins = durationMinutes % 60;
          const durationStr = hours > 0 ? `${hours}h ${mins > 0 ? `${mins}m` : ''}` : `${mins}m`;

          calendarEvents.push({
            id: session.id,
            title: session.title,
            type: session.session_type === 'qanda' ? 'meeting' : 'training',
            date: startDate.toISOString().split('T')[0],
            startTime: startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            endTime: endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            duration: durationStr,
            status: 'scheduled',
            participants: session.max_attendees,
            location: session.join_link ? 'Online' : 'TBD',
            color: '#3B82F6',
            icon: session.session_type === 'qanda' ? Users : Video,
            description: session.description || 'Join this live session',
            reminder: true,
            joinLink: session.join_link,
            isMeeting: true,
          });
        });

        // Add assigned exercises with due dates
        if (Array.isArray(assignedExercises)) {
          assignedExercises.forEach((exercise: AssignedExercise) => {
            if (exercise.due_date) {
              const dueDate = new Date(exercise.due_date);
              const dateStr = dueDate.toISOString().split('T')[0];
              calendarEvents.push({
                id: `exercise-${exercise.id}`,
                title: exercise.title,
                type: 'assessment',
                date: dateStr,
                startTime: dueDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                endTime: '',
                duration: `${exercise.time_limit_minutes} min`,
                status: exercise.status === 'completed' ? 'completed' : 'scheduled',
                participants: 1,
                location: 'Online',
                color: exercise.status === 'completed' ? '#10B981' : '#F59E0B',
                icon: FileText,
                description: exercise.description || `Complete this exercise by the due date. Passing score: ${exercise.passing_score}%`,
                reminder: true,
                isExercise: true,
                exerciseId: exercise.id,
              });
            }
          });
        }

        // Sort by date
        calendarEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setEvents(calendarEvents);
      } catch {
        showToast({ type: 'error', message: 'Failed to load calendar events' });
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
  }, []);

  // Calculate stats based on real data
  const stats = {
    trainings: events.filter(e => e.type === 'training').length,
    simulations: events.filter(e => e.type === 'simulation').length,
    completed: events.filter(e => e.status === 'completed').length,
    pending: events.filter(e => e.status === 'scheduled' && new Date(e.date) >= new Date()).length,
  };

  const upcomingEvents = events.filter(event => {
    const eventDate = new Date(event.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return eventDate >= today;
  }).slice(0, 5);

  const getEventTypeIcon = (type: CalendarEvent['type']) => {
    switch (type) {
      case 'training':
        return { icon: BookOpen, label: 'Training' };
      case 'simulation':
        return { icon: Users, label: 'Simulation' };
      case 'meeting':
        return { icon: Users, label: 'Meeting' };
      case 'assessment':
        return { icon: Award, label: 'Assessment' };
      case 'certification':
        return { icon: Award, label: 'Certification' };
      default:
        return { icon: BookOpen, label: 'Event' };
    }
  };

  const getStatusBadge = (status: CalendarEvent['status']) => {
    switch (status) {
      case 'scheduled':
        return <span className="status-badge scheduled">Scheduled</span>;
      case 'in-progress':
        return <span className="status-badge in-progress">In Progress</span>;
      case 'completed':
        return <span className="status-badge completed">Completed</span>;
      case 'cancelled':
        return <span className="status-badge cancelled">Cancelled</span>;
      default:
        return null;
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + (direction === 'next' ? 1 : -1));
      return newDate;
    });
  };

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
  };

  const handleJoinMeeting = (joinLink?: string) => {
    if (joinLink) {
      navigate(joinLink);
    }
  };

  const renderMonthView = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();

    const days = [];
    
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDay - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthLastDay - i),
        isCurrentMonth: false,
        events: []
      });
    }

    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month, i);
      const dayEvents = events.filter(event => {
        const eventDate = new Date(event.date);
        return eventDate.toDateString() === date.toDateString();
      });
      days.push({
        date,
        isCurrentMonth: true,
        events: dayEvents
      });
    }

    const totalCells = 42;
    const remainingDays = totalCells - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false,
        events: []
      });
    }

    return (
      <div className="calendar-grid">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="calendar-header-day">
            {day}
          </div>
        ))}
        
        {days.map((day, index) => (
          <div
            key={index}
            className={`calendar-day ${day.isCurrentMonth ? 'current-month' : 'other-month'} ${
              day.date.toDateString() === new Date().toDateString() ? 'today' : ''
            }`}
          >
            <div className="day-header">
              <span className="day-number">{day.date.getDate()}</span>
              {day.date.toDateString() === new Date().toDateString() && (
                <span className="today-badge">Today</span>
              )}
            </div>
            <div className="day-events">
              {day.events.slice(0, 3).map(event => (
                <div
                  key={event.id}
                  className="event-preview"
                  style={{ borderLeftColor: event.color }}
                  onClick={() => handleEventClick(event)}
                >
                  <div className="event-time">
                    <Clock size={10} />
                    {event.startTime}
                  </div>
                  <div className="event-title">{event.title}</div>
                </div>
              ))}
              {day.events.length > 3 && (
                <div className="more-events">+{day.events.length - 3} more</div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderWeekView = () => {
    const startOfWeek = new Date(currentDate);
    const day = startOfWeek.getDay(); // 0=Sun
    startOfWeek.setDate(currentDate.getDate() - day);

    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      return d;
    });

    const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 6am–10pm

    const eventsForDay = (d: Date) =>
      events.filter(e => new Date(e.date).toDateString() === d.toDateString());

    const eventTop = (startTime: string): number => {
      const [h, m] = startTime.split(':').map(Number);
      if (isNaN(h)) return 0;
      return Math.max(0, (h - 6) * 56 + (m || 0) * (56 / 60));
    };

    return (
      <div className="week-view">
        <div className="week-header-row">
          <div className="week-time-gutter" />
          {weekDays.map((d, i) => (
            <div key={i} className={`week-day-header ${d.toDateString() === new Date().toDateString() ? 'today' : ''}`}>
              <span className="week-day-name">{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
              <span className="week-day-num">{d.getDate()}</span>
            </div>
          ))}
        </div>
        <div className="week-body">
          <div className="week-time-col">
            {HOURS.map(h => (
              <div key={h} className="week-hour-label">
                {h === 12 ? '12pm' : h > 12 ? `${h - 12}pm` : `${h}am`}
              </div>
            ))}
          </div>
          {weekDays.map((d, i) => (
            <div key={i} className="week-day-col">
              {HOURS.map(h => <div key={h} className="week-hour-cell" />)}
              {eventsForDay(d).map(ev => (
                <div
                  key={ev.id}
                  className="week-event"
                  style={{ top: eventTop(ev.startTime), borderLeftColor: ev.color }}
                  onClick={() => handleEventClick(ev)}
                >
                  <span className="week-event-time">{ev.startTime}</span>
                  <span className="week-event-title">{ev.title}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderDayView = () => {
    const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 6am–10pm
    const todayEvents = events.filter(
      e => new Date(e.date).toDateString() === currentDate.toDateString(),
    );

    const eventTop = (startTime: string): number => {
      const parts = startTime.match(/(\d+):(\d+)\s*(AM|PM)?/i);
      if (!parts) return 0;
      let h = parseInt(parts[1]);
      const m = parseInt(parts[2]);
      const meridiem = parts[3]?.toUpperCase();
      if (meridiem === 'PM' && h !== 12) h += 12;
      if (meridiem === 'AM' && h === 12) h = 0;
      return Math.max(0, (h - 6) * 56 + m * (56 / 60));
    };

    return (
      <div className="day-view">
        <div className="day-view-header">
          <span className="day-view-title">
            {currentDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
          <span className="day-event-count">{todayEvents.length} event{todayEvents.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="day-view-body">
          <div className="day-time-col">
            {HOURS.map(h => (
              <div key={h} className="day-hour-row">
                <span className="day-hour-label">
                  {h === 12 ? '12pm' : h > 12 ? `${h - 12}pm` : `${h}am`}
                </span>
                <div className="day-hour-line" />
              </div>
            ))}
          </div>
          <div className="day-events-col">
            {HOURS.map(h => <div key={h} className="day-hour-cell" />)}
            {todayEvents.map(ev => (
              <div
                key={ev.id}
                className="day-event"
                style={{ top: eventTop(ev.startTime), borderLeftColor: ev.color }}
                onClick={() => handleEventClick(ev)}
              >
                <span className="day-event-time">{ev.startTime} – {ev.endTime}</span>
                <span className="day-event-title">{ev.title}</span>
                {ev.location && <span className="day-event-loc">📍 {ev.location}</span>}
              </div>
            ))}
            {todayEvents.length === 0 && (
              <div className="day-no-events">No events scheduled for this day</div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderCalendarView = () => {
    if (viewMode === 'month') return renderMonthView();
    if (viewMode === 'week') return renderWeekView();
    return renderDayView();
  };

  if (loading) {
    return (
      <div className="calendar-page loading">
        <PageLoader message="Loading calendar…" className="min-h-0 py-12" />
      </div>
    );
  }

  return (
    <div className="calendar-page">
{/* Header */}
      <div className="calendar-header">
        <div className="header-content">
          <div className="header-title">
            <CalendarIcon size={32} />
            <h1>Training Calendar</h1>
          </div>
          <p className="header-subtitle">
            View your scheduled training sessions, meetings, and assignment due dates.
          </p>
        </div>
      </div>

      <div className="calendar-content">
        {/* Calendar Controls */}
        <div className="calendar-controls card-3d">
          <div className="view-selector">
            <button 
              className={`view-btn ${viewMode === 'month' ? 'active' : ''}`}
              onClick={() => setViewMode('month')}
            >
              Month
            </button>
            <button 
              className={`view-btn ${viewMode === 'week' ? 'active' : ''}`}
              onClick={() => setViewMode('week')}
            >
              Week
            </button>
            <button 
              className={`view-btn ${viewMode === 'day' ? 'active' : ''}`}
              onClick={() => setViewMode('day')}
            >
              Day
            </button>
          </div>
          <div className="date-navigation">
            <button className="nav-btn" onClick={() => navigateMonth('prev')}>
              <ChevronLeft size={20} />
            </button>
            <div className="current-date">
              {formatDate(currentDate)}
            </div>
            <button className="nav-btn" onClick={() => navigateMonth('next')}>
              <ChevronRight size={20} />
            </button>
          </div>
          <button className="today-btn" onClick={() => setCurrentDate(new Date())}>
            Today
          </button>
        </div>

        <div className="calendar-layout">
          {/* Main Calendar */}
          <div className="calendar-main card-3d">
            {renderCalendarView()}
          </div>

          {/* Sidebar */}
          <div className="calendar-sidebar">
            {/* Upcoming Events */}
            <div className="upcoming-events card-3d">
              <div className="section-header">
                <h3>Upcoming Events</h3>
                <span className="events-count">{upcomingEvents.length} events</span>
              </div>
              <div className="events-list">
                {upcomingEvents.length === 0 ? (
                  <div className="empty-events">No upcoming events</div>
                ) : (
                  upcomingEvents.map(event => (
                    <div key={event.id} className="event-card" onClick={() => handleEventClick(event)}>
                      <div className="event-time-display">
                        <div className="event-time-main">
                          <Clock size={14} />
                          {event.startTime}
                        </div>
                        <div className="event-duration">{event.duration}</div>
                      </div>
                      <div className="event-content">
                        <div className="event-header">
                          <h4 className="event-title">{event.title}</h4>
                          {getStatusBadge(event.status)}
                        </div>
                        <div className="event-meta">
                          <span className="event-type">
                            <event.icon size={14} />
                            {getEventTypeIcon(event.type).label}
                          </span>
                          <span className="event-location">
                            📍 {event.location}
                          </span>
                        </div>
                        {event.participants && (
                          <div className="event-participants">
                            <Users size={14} />
                            {event.participants} participants
                          </div>
                        )}
                      </div>
                      {event.reminder && (
                        <div className="event-reminder">
                          <Bell size={14} />
                        </div>
                      )}
                      {event.joinLink && (
                        <button 
                          className="join-event-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleJoinMeeting(event.joinLink);
                          }}
                        >
                          <PlayCircle size={14} /> Join
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Event Stats */}
            <div className="event-stats card-3d">
              <div className="section-header">
                <h3>Monthly Overview</h3>
              </div>
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-icon" style={{ background: '#3B82F6' }}>
                    <BookOpen size={20} />
                  </div>
                  <div className="stat-content">
                    <span className="stat-value">{stats.trainings}</span>
                    <span className="stat-label">Trainings</span>
                  </div>
                </div>
                <div className="stat-item">
                  <div className="stat-icon" style={{ background: '#8B5CF6' }}>
                    <Users size={20} />
                  </div>
                  <div className="stat-content">
                    <span className="stat-value">{stats.simulations}</span>
                    <span className="stat-label">Simulations</span>
                  </div>
                </div>
                <div className="stat-item">
                  <div className="stat-icon" style={{ background: '#10B981' }}>
                    <CheckCircle size={20} />
                  </div>
                  <div className="stat-content">
                    <span className="stat-value">{stats.completed}</span>
                    <span className="stat-label">Completed</span>
                  </div>
                </div>
                <div className="stat-item">
                  <div className="stat-icon" style={{ background: '#F59E0B' }}>
                    <AlertTriangle size={20} />
                  </div>
                  <div className="stat-content">
                    <span className="stat-value">{stats.pending}</span>
                    <span className="stat-label">Pending</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Event Details Modal */}
      {selectedEvent && (
        <div className="event-modal-overlay" onClick={() => setSelectedEvent(null)}>
          <div className="event-modal card-3d" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="event-type-badge" style={{ background: selectedEvent.color }}>
                <selectedEvent.icon size={20} />
                <span>{getEventTypeIcon(selectedEvent.type).label}</span>
              </div>
              <button className="close-modal" onClick={() => setSelectedEvent(null)}>×</button>
            </div>
            
            <div className="modal-content">
              <h2>{selectedEvent.title}</h2>
              <p className="event-description">{selectedEvent.description}</p>
              
              <div className="event-details">
                <div className="detail-item">
                  <Clock size={18} />
                  <div>
                    <span className="detail-label">Date & Time</span>
                    <span className="detail-value">
                      {new Date(selectedEvent.date).toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                      <br />
                      {selectedEvent.startTime} - {selectedEvent.endTime} ({selectedEvent.duration})
                    </span>
                  </div>
                </div>
                
                <div className="detail-item">
                  <span className="detail-icon">📍</span>
                  <div>
                    <span className="detail-label">Location</span>
                    <span className="detail-value">{selectedEvent.location}</span>
                  </div>
                </div>
                
                {selectedEvent.participants && (
                  <div className="detail-item">
                    <Users size={18} />
                    <div>
                      <span className="detail-label">Participants</span>
                      <span className="detail-value">{selectedEvent.participants} people</span>
                    </div>
                  </div>
                )}
                
                <div className="detail-item">
                  <Bell size={18} />
                  <div>
                    <span className="detail-label">Reminder</span>
                    <span className="detail-value">
                      {selectedEvent.reminder ? 'Set for 30 minutes before' : 'No reminder set'}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="modal-actions">
                {selectedEvent.joinLink && (
                  <button 
                    className="join-now-btn"
                    onClick={() => handleJoinMeeting(selectedEvent.joinLink)}
                  >
                    <PlayCircle size={18} />
                    Join Meeting
                  </button>
                )}
                {selectedEvent.isExercise && selectedEvent.exerciseId && (
                  <button 
                    className="start-exercise-btn"
                    onClick={() => navigate(`/dashboard/exercises`)}
                  >
                    <FileText size={18} />
                    Go to Exercise
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarPage;