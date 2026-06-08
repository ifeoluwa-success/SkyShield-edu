from django.db import models
from django.contrib.auth import get_user_model
from django.utils import timezone
import uuid

User = get_user_model()

class Meeting(models.Model):
    """Live class meeting model similar to Google Meet"""
    
    MEETING_STATUS = (
        ('scheduled', 'Scheduled'),
        ('live', 'Live'),
        ('ended', 'Ended'),
        ('cancelled', 'Cancelled'),
        ('recorded', 'Recorded'),
    )
    
    MEETING_TYPES = (
        ('one_on_one', 'One-on-One'),
        ('group', 'Group Session'),
        ('workshop', 'Workshop'),
        ('webinar', 'Webinar'),
    )
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    
    # Meeting identifiers (like Google Meet codes)
    meeting_code = models.CharField(max_length=50, unique=True, db_index=True)
    room_name = models.CharField(max_length=100, unique=True)
    
    # Relations
    host = models.ForeignKey(User, on_delete=models.CASCADE, related_name='hosted_meetings')
    
    # Add tutor_profile back with string reference to avoid circular import
    # This allows meetings to be associated with tutors for training sessions
    tutor_profile = models.ForeignKey(
        'tutor.TutorProfile', 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='meetings'
    )
    
    # Meeting details
    meeting_type = models.CharField(max_length=20, choices=MEETING_TYPES, default='group')
    status = models.CharField(max_length=20, choices=MEETING_STATUS, default='scheduled')
    
    # Schedule
    scheduled_start = models.DateTimeField()
    scheduled_end = models.DateTimeField()
    actual_start = models.DateTimeField(null=True, blank=True)
    actual_end = models.DateTimeField(null=True, blank=True)
    
    # Settings
    max_participants = models.IntegerField(default=50)
    is_private = models.BooleanField(default=False)
    require_host_to_start = models.BooleanField(default=True)
    allow_recording = models.BooleanField(default=True)
    allow_chat = models.BooleanField(default=True)
    allow_screen_share = models.BooleanField(default=True)
    
    # Security
    password = models.CharField(max_length=100, blank=True)
    waiting_room_enabled = models.BooleanField(default=False)
    lock_on_start = models.BooleanField(default=False)
    
    # Recording (will be processed by Celery)
    recording_url = models.URLField(blank=True)
    recording_available = models.BooleanField(default=False)
    
    # Statistics
    participant_count = models.IntegerField(default=0)
    peak_participants = models.IntegerField(default=0)
    duration_seconds = models.IntegerField(default=0)
    
    # Metadata
    settings = models.JSONField(default=dict, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'meetings'
        indexes = [
            models.Index(fields=['meeting_code']),
            models.Index(fields=['room_name']),
            models.Index(fields=['host', '-scheduled_start']),
            models.Index(fields=['tutor_profile', '-scheduled_start']),  # Added for tutor filtering
            models.Index(fields=['status', 'scheduled_start']),
        ]
        ordering = ['-scheduled_start']
    
    def __str__(self):
        return f"{self.title} - {self.meeting_code}"
    
    def save(self, *args, **kwargs):
        if not self.meeting_code:
            self.meeting_code = self.generate_meeting_code()
        if not self.room_name:
            self.room_name = f"room_{self.meeting_code}"
        super().save(*args, **kwargs)
    
    @staticmethod
    def generate_meeting_code():
        """Generate a unique meeting code (like Google Meet codes)"""
        import random
        import string
        while True:
            code = ''.join(random.choices(string.ascii_lowercase + string.digits, k=10))
            if not Meeting.objects.filter(meeting_code=code).exists():
                return code
    
    def start_meeting(self):
        """Mark meeting as live"""
        self.status = 'live'
        self.actual_start = timezone.now()
        self.save()
    
    def end_meeting(self):
        """Mark meeting as ended"""
        self.status = 'ended'
        self.actual_end = timezone.now()
        if self.actual_start:
            self.duration_seconds = int((self.actual_end - self.actual_start).total_seconds())
        self.save()
    
    def update_participant_count(self):
        """Update participant count based on active participants"""
        count = self.participants.filter(
            is_active=True,
            left_at__isnull=True
        ).count()
        self.participant_count = count
        if count > self.peak_participants:
            self.peak_participants = count
        self.save(update_fields=['participant_count', 'peak_participants'])


class MeetingParticipant(models.Model):
    """Track meeting participants and their WebRTC connections"""
    
    PARTICIPANT_ROLES = (
        ('host', 'Host'),
        ('co_host', 'Co-Host'),
        ('participant', 'Participant'),
        ('observer', 'Observer'),
    )
    
    PARTICIPANT_STATUS = (
        ('invited', 'Invited'),
        ('waiting', 'In Waiting Room'),
        ('joining', 'Joining'),
        ('connected', 'Connected'),
        ('disconnected', 'Disconnected'),
        ('rejected', 'Rejected'),
    )
    
    MEDIA_STATES = (
        ('enabled', 'Enabled'),
        ('disabled', 'Disabled'),
        ('muted', 'Muted'),
    )
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    meeting = models.ForeignKey(Meeting, on_delete=models.CASCADE, related_name='participants')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='meeting_participations')
    
    # Participation details
    role = models.CharField(max_length=20, choices=PARTICIPANT_ROLES, default='participant')
    status = models.CharField(max_length=20, choices=PARTICIPANT_STATUS, default='invited')
    
    # WebRTC connection info
    channel_name = models.CharField(max_length=255, blank=True)
    session_id = models.CharField(max_length=255, blank=True)
    peer_id = models.CharField(max_length=255, blank=True)
    
    # Media states
    video_enabled = models.BooleanField(default=False)
    audio_enabled = models.BooleanField(default=False)
    screen_sharing = models.BooleanField(default=False)
    video_state = models.CharField(max_length=20, choices=MEDIA_STATES, default='disabled')
    audio_state = models.CharField(max_length=20, choices=MEDIA_STATES, default='disabled')
    
    # Connection quality
    connection_quality = models.CharField(max_length=20, default='unknown')
    ice_servers_used = models.JSONField(default=dict, blank=True)
    
    # Timing
    invited_at = models.DateTimeField(null=True, blank=True)
    joined_at = models.DateTimeField(null=True, blank=True)
    left_at = models.DateTimeField(null=True, blank=True)
    last_heartbeat = models.DateTimeField(auto_now=True)
    
    # Metadata
    metadata = models.JSONField(default=dict, blank=True)
    client_info = models.JSONField(default=dict, blank=True)  # browser, device, etc.
    
    # Flags
    is_active = models.BooleanField(default=False)
    is_muted = models.BooleanField(default=False)
    hand_raised = models.BooleanField(default=False)
    
    class Meta:
        db_table = 'meeting_participants'
        indexes = [
            models.Index(fields=['meeting', 'user']),
            models.Index(fields=['meeting', 'is_active']),
            models.Index(fields=['status']),
        ]
        unique_together = ['meeting', 'user']
    
    def __str__(self):
        return f"{self.user.username} in {self.meeting.meeting_code}"
    
    def join(self, channel_name, session_id, peer_id=None):
        """Mark participant as joined"""
        self.status = 'connected'
        self.channel_name = channel_name
        self.session_id = session_id
        if peer_id:
            self.peer_id = peer_id
        self.joined_at = timezone.now()
        self.is_active = True
        self.save()
        self.meeting.update_participant_count()
    
    def leave(self):
        """Mark participant as left"""
        self.status = 'disconnected'
        self.left_at = timezone.now()
        self.is_active = False
        self.channel_name = ''
        self.video_enabled = False
        self.audio_enabled = False
        self.screen_sharing = False
        self.save()
        self.meeting.update_participant_count()
    
    def update_media_state(self, video=None, audio=None, screen=None):
        """Update participant media states"""
        if video is not None:
            self.video_enabled = video
            self.video_state = 'enabled' if video else 'disabled'
        if audio is not None:
            self.audio_enabled = audio
            self.audio_state = 'enabled' if audio else ('muted' if self.is_muted else 'disabled')
        if screen is not None:
            self.screen_sharing = screen
        self.save()


class MeetingInvitation(models.Model):
    """Track meeting invitations"""
    
    INVITATION_STATUS = (
        ('pending', 'Pending'),
        ('accepted', 'Accepted'),
        ('declined', 'Declined'),
        ('expired', 'Expired'),
    )
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    meeting = models.ForeignKey(Meeting, on_delete=models.CASCADE, related_name='invitations')
    invited_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='meeting_invitations')
    invited_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sent_invitations')
    
    status = models.CharField(max_length=20, choices=INVITATION_STATUS, default='pending')
    token = models.CharField(max_length=255, unique=True)
    
    email_sent = models.BooleanField(default=False)
    notification_sent = models.BooleanField(default=False)
    
    responded_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField()
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'meeting_invitations'
        indexes = [
            models.Index(fields=['meeting', 'status']),
            models.Index(fields=['token']),
        ]
    
    def __str__(self):
        return f"Invitation to {self.invited_user.email} for {self.meeting.title}"
    
    def save(self, *args, **kwargs):
        if not self.token:
            import uuid
            self.token = str(uuid.uuid4())
        if not self.expires_at:
            self.expires_at = timezone.now() + timezone.timedelta(days=7)
        super().save(*args, **kwargs)


class MeetingRecording(models.Model):
    """Track meeting recordings"""
    
    RECORDING_STATUS = (
        ('requested', 'Requested'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    )
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    meeting = models.ForeignKey(Meeting, on_delete=models.CASCADE, related_name='recordings')
    requested_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    
    status = models.CharField(max_length=20, choices=RECORDING_STATUS, default='requested')
    
    # File info
    file_path = models.CharField(max_length=500, blank=True)
    file_size = models.BigIntegerField(default=0)
    duration_seconds = models.IntegerField(default=0)
    
    # Processing
    task_id = models.CharField(max_length=255, blank=True)
    error_message = models.TextField(blank=True)
    
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'meeting_recordings'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"Recording of {self.meeting.title}"


class MeetingChat(models.Model):
    """Store meeting chat messages"""
    
    MESSAGE_TYPES = (
        ('text', 'Text'),
        ('system', 'System'),
        ('private', 'Private'),
    )
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    meeting = models.ForeignKey(Meeting, on_delete=models.CASCADE, related_name='chat_messages')
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sent_messages')
    recipient = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True, 
                                  related_name='private_messages')
    
    message_type = models.CharField(max_length=20, choices=MESSAGE_TYPES, default='text')
    content = models.TextField()
    
    is_edited = models.BooleanField(default=False)
    is_deleted = models.BooleanField(default=False)
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'meeting_chat'
        indexes = [
            models.Index(fields=['meeting', '-created_at']),
        ]
        ordering = ['created_at']
    
    def __str__(self):
        return f"Chat from {self.sender.username} in {self.meeting.meeting_code}"