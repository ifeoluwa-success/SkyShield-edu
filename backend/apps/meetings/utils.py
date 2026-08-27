import uuid
import random
import string
from datetime import datetime, timedelta
from django.utils import timezone
from django.core.cache import cache
from django.conf import settings


def generate_meeting_code(length=10):
    """Generate a unique meeting code"""
    chars = string.ascii_lowercase + string.digits
    while True:
        code = ''.join(random.choices(chars, k=length))
        # Check if code exists in cache or DB
        if not cache.get(f"meeting_code_{code}"):
            cache.set(f"meeting_code_{code}", True, timeout=60)  # Temporary lock
            return code


def generate_room_name(meeting_code):
    """Generate a room name from meeting code"""
    return f"room_{meeting_code}"


def get_ice_servers():
    """Get ICE servers configuration"""
    servers = settings.ICE_SERVERS.copy()
    
    # Add TURN servers if configured
    if hasattr(settings, 'TURN_SERVERS') and settings.TURN_SERVERS:
        servers.extend(settings.TURN_SERVERS)
    
    return servers


def format_duration(seconds):
    """Format duration in seconds to human readable"""
    if seconds < 60:
        return f"{seconds} seconds"
    elif seconds < 3600:
        minutes = seconds // 60
        return f"{minutes} minute{'s' if minutes != 1 else ''}"
    else:
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        if minutes:
            return f"{hours} hour{'s' if hours != 1 else ''} {minutes} minute{'s' if minutes != 1 else ''}"
        return f"{hours} hour{'s' if hours != 1 else ''}"


def can_join_meeting(meeting, user):
    """Check if user can join a meeting"""
    if meeting.status not in ['scheduled', 'live']:
        return False, f"Meeting is {meeting.get_status_display()}"
    
    if meeting.participant_count >= meeting.max_participants:
        return False, "Meeting has reached maximum capacity"
    
    if meeting.is_private and not meeting.participants.filter(user=user).exists():
        return False, "This is a private meeting"
    
    return True, "OK"


def authorize_meeting_websocket(meeting, user, password=''):
    """
    Enforce the same password / invite / membership rules as HTTP meeting joins.

    Returns (allowed: bool, reason: str).
    """
    from .models import MeetingInvitation, MeetingParticipant

    role = getattr(user, 'role', None)
    if role in ('admin', 'supervisor'):
        return True, 'OK'

    if meeting.host_id == user.id:
        return True, 'OK'

    if meeting.status not in ('scheduled', 'live'):
        return False, f'Meeting is {meeting.get_status_display()}'

    # Prefer membership established by HTTP join or invitation accept.
    existing = MeetingParticipant.objects.filter(
        meeting=meeting,
        user=user,
    ).exclude(status='rejected').exists()
    if existing:
        return True, 'OK'

    invited = MeetingInvitation.objects.filter(
        meeting=meeting,
        invited_user=user,
        status='accepted',
    ).exists()
    if invited:
        return True, 'OK'

    if meeting.is_private:
        if meeting.password:
            if password and meeting.password == password:
                return True, 'OK'
            return False, 'Invalid meeting password'
        return False, 'This is a private meeting'

    # Public meetings: allow when under capacity (mirrors HTTP join gates).
    if meeting.participant_count >= meeting.max_participants:
        return False, 'Meeting has reached maximum capacity'

    return True, 'OK'


def create_meeting_invitation(meeting, invited_user, invited_by):
    """Create meeting invitation with token"""
    from .models import MeetingInvitation
    
    token = str(uuid.uuid4())
    expires_at = timezone.now() + timedelta(days=settings.MEETING_SETTINGS.get('INVITATION_EXPIRY_DAYS', 7))
    
    invitation = MeetingInvitation.objects.create(
        meeting=meeting,
        invited_user=invited_user,
        invited_by=invited_by,
        token=token,
        expires_at=expires_at
    )
    
    return invitation


def cleanup_expired_meetings():
    """Clean up expired meetings"""
    from .models import Meeting
    
    # Find meetings that ended more than 24 hours ago
    cutoff = timezone.now() - timedelta(hours=24)
    expired_meetings = Meeting.objects.filter(
        status='ended',
        actual_end__lt=cutoff
    )
    
    count = expired_meetings.count()
    expired_meetings.update(status='recorded')
    
    return count