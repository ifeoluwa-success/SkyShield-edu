from django.db import models
from django.contrib.auth import get_user_model
from django.utils import timezone
import uuid

User = get_user_model()

class TutorProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='tutor_profile')
    specialization = models.JSONField(default=list)
    bio = models.TextField(blank=True)
    qualifications = models.JSONField(default=list)
    experience_years = models.IntegerField(default=0)
    
    # Teaching stats
    total_students = models.IntegerField(default=0)
    total_sessions = models.IntegerField(default=0)
    total_meetings = models.IntegerField(default=0)
    average_rating = models.FloatField(default=0.0)
    
    # Meeting settings
    default_meeting_duration = models.IntegerField(default=60)
    default_max_participants = models.IntegerField(default=50)
    allow_recording = models.BooleanField(default=True)
    allow_chat = models.BooleanField(default=True)
    allow_screen_share = models.BooleanField(default=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'tutor_profiles'
        verbose_name = 'Tutor Profile'
        verbose_name_plural = 'Tutor Profiles'
    
    def __str__(self):
        return f"{self.user.get_full_name()} - Tutor"
    
    def update_stats(self):
        from django.apps import apps
        Meeting = apps.get_model('meetings', 'Meeting')
        self.total_meetings = Meeting.objects.filter(host=self.user).count()
        self.total_sessions = self.sessions.count()
        self.save()


class TeachingMaterial(models.Model):
    MATERIAL_TYPES = (
        ('video', 'Video'),
        ('document', 'Document'),
        ('presentation', 'Presentation'),
        ('exercise', 'Exercise'),
        ('quiz', 'Quiz'),
    )
    DIFFICULTY_LEVELS = (
        ('beginner', 'Beginner'),
        ('intermediate', 'Intermediate'),
        ('advanced', 'Advanced'),
    )
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tutor = models.ForeignKey(TutorProfile, on_delete=models.CASCADE, related_name='materials')
    title = models.CharField(max_length=200)
    description = models.TextField()
    material_type = models.CharField(max_length=20, choices=MATERIAL_TYPES)
    difficulty = models.CharField(max_length=20, choices=DIFFICULTY_LEVELS)
    
    file = models.FileField(upload_to='tutor/materials/', null=True, blank=True)
    video_url = models.URLField(blank=True)
    content = models.JSONField(default=dict)
    
    tags = models.JSONField(default=list)
    duration_minutes = models.IntegerField(default=0)
    is_published = models.BooleanField(default=False)
    is_featured = models.BooleanField(default=False)
    
    views_count = models.IntegerField(default=0)
    downloads_count = models.IntegerField(default=0)
    average_rating = models.FloatField(default=0.0)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'teaching_materials'
        indexes = [
            models.Index(fields=['tutor', '-created_at']),
            models.Index(fields=['material_type']),
            models.Index(fields=['difficulty']),
            models.Index(fields=['is_published']),
        ]
        ordering = ['-created_at']
        verbose_name = 'Teaching Material'
        verbose_name_plural = 'Teaching Materials'
    
    def __str__(self):
        return self.title


class TeachingSession(models.Model):
    SESSION_TYPES = (
        ('live', 'Live Session'),
        ('recorded', 'Recorded Session'),
        ('workshop', 'Workshop'),
        ('qanda', 'Q&A Session'),
    )
    PLATFORMS = (
        ('google_meet', 'Google Meet'),
        ('zoom', 'Zoom'),
        ('teams', 'Microsoft Teams'),
        ('custom', 'Custom Link'),
        ('internal', 'Internal Meeting'),
    )
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tutor = models.ForeignKey(TutorProfile, on_delete=models.CASCADE, related_name='sessions')
    title = models.CharField(max_length=200)
    description = models.TextField()
    session_type = models.CharField(max_length=20, choices=SESSION_TYPES)
    platform = models.CharField(max_length=20, choices=PLATFORMS)
    
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    timezone = models.CharField(max_length=50, default='UTC')
    
    meeting_link = models.URLField(blank=True)
    meeting_id = models.CharField(max_length=100, blank=True)
    meeting_password = models.CharField(max_length=100, blank=True)
    
    internal_meeting = models.ForeignKey(
        'meetings.Meeting',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='teaching_sessions'
    )
    
    max_attendees = models.IntegerField(default=50)
    current_attendees = models.IntegerField(default=0)
    
    is_cancelled = models.BooleanField(default=False)
    cancellation_reason = models.TextField(blank=True)
    
    recording_url = models.URLField(blank=True)
    recording_available = models.BooleanField(default=False)
    
    materials = models.ManyToManyField(TeachingMaterial, blank=True, related_name='sessions')
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'teaching_sessions'
        indexes = [
            models.Index(fields=['tutor', 'start_time']),
            models.Index(fields=['session_type']),
            models.Index(fields=['platform']),
        ]
        ordering = ['start_time']
        verbose_name = 'Teaching Session'
        verbose_name_plural = 'Teaching Sessions'
    
    def __str__(self):
        return f"{self.title} - {self.start_time}"
    
    def create_internal_meeting(self):
        if self.platform == 'internal' and not self.internal_meeting:
            from django.apps import apps
            Meeting = apps.get_model('meetings', 'Meeting')
            meeting = Meeting.objects.create(
                title=self.title,
                description=self.description,
                host=self.tutor.user,
                tutor_profile=self.tutor,
                scheduled_start=self.start_time,
                scheduled_end=self.end_time,
                max_participants=self.max_attendees,
                meeting_type='group'
            )
            self.internal_meeting = meeting
            self.meeting_link = f"/meetings/join/{meeting.meeting_code}/"
            self.meeting_id = meeting.meeting_code
            self.save()
            return meeting
        return self.internal_meeting


class SessionAttendance(models.Model):
    session = models.ForeignKey(TeachingSession, on_delete=models.CASCADE, related_name='attendances')
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name='session_attendances')
    joined_at = models.DateTimeField(null=True, blank=True)
    left_at = models.DateTimeField(null=True, blank=True)
    duration_seconds = models.IntegerField(default=0)
    feedback = models.TextField(blank=True)
    rating = models.IntegerField(null=True, blank=True)
    
    class Meta:
        db_table = 'session_attendances'
        unique_together = ['session', 'student']
        verbose_name = 'Session Attendance'
        verbose_name_plural = 'Session Attendances'
    
    def __str__(self):
        return f"{self.student.email} - {self.session.title}"


class StudentProgress(models.Model):
    tutor = models.ForeignKey(TutorProfile, on_delete=models.CASCADE, related_name='student_progress')
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name='tutor_progress')
    
    completed_materials = models.JSONField(default=list)
    completed_sessions = models.JSONField(default=list)
    completed_exercises = models.JSONField(default=list)
    attended_meetings = models.JSONField(default=list)
    
    average_score = models.FloatField(default=0.0)
    total_time_spent = models.IntegerField(default=0)
    last_activity = models.DateTimeField(null=True, blank=True)
    
    tutor_notes = models.TextField(blank=True)
    strengths = models.JSONField(default=list)
    areas_for_improvement = models.JSONField(default=list)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'student_progress'
        unique_together = ['tutor', 'student']
        verbose_name = 'Student Progress'
        verbose_name_plural = 'Student Progresses'
    
    def __str__(self):
        return f"{self.tutor.user.email} - {self.student.email}"
    
    def add_meeting_attendance(self, meeting_id):
        meeting_key = str(meeting_id)
        if self.attended_meetings is None:
            self.attended_meetings = []
        attended = [str(m) for m in self.attended_meetings]
        if meeting_key not in attended:
            self.attended_meetings = attended + [meeting_key]
            self.last_activity = timezone.now()
            self.save(update_fields=['attended_meetings', 'last_activity', 'updated_at'])


class Exercise(models.Model):
    EXERCISE_TYPES = (
        ('multiple_choice', 'Multiple Choice'),
        ('fill_blanks', 'Fill in the Blanks'),
        ('matching', 'Matching'),
        ('scenario', 'Scenario Based'),
    )
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tutor = models.ForeignKey(TutorProfile, on_delete=models.CASCADE, related_name='exercises')
    title = models.CharField(max_length=200)
    description = models.TextField()
    exercise_type = models.CharField(max_length=20, choices=EXERCISE_TYPES)
    
    questions = models.JSONField()
    answers = models.JSONField()
    explanations = models.JSONField(default=dict)
    
    time_limit_minutes = models.IntegerField(null=True, blank=True)
    passing_score = models.IntegerField(default=70)
    max_attempts = models.IntegerField(default=3)
    
    due_date = models.DateTimeField(null=True, blank=True, help_text="Date by which the exercise should be completed")
    
    is_published = models.BooleanField(default=False)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'exercises'
        verbose_name = 'Exercise'
        verbose_name_plural = 'Exercises'
    
    def __str__(self):
        return self.title


class ExerciseAttempt(models.Model):
    exercise = models.ForeignKey(Exercise, on_delete=models.CASCADE, related_name='attempts')
    student = models.ForeignKey(User, on_delete=models.CASCADE)
    score = models.FloatField(default=0.0)
    answers = models.JSONField()
    time_taken = models.IntegerField(default=0)
    passed = models.BooleanField(default=False)
    attempt_number = models.IntegerField(default=1)
    feedback = models.TextField(blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        db_table = 'exercise_attempts'
        unique_together = ['exercise', 'student', 'attempt_number']
        verbose_name = 'Exercise Attempt'
        verbose_name_plural = 'Exercise Attempts'
    
    def __str__(self):
        return f"{self.student.email} - {self.exercise.title} - Attempt {self.attempt_number}"


class Report(models.Model):
    REPORT_TYPES = (
        ('student_performance', 'Student Performance'),
        ('exercise_analytics', 'Exercise Analytics'),
        ('quarterly_review', 'Quarterly Review'),
        ('content_analysis', 'Content Analysis'),
    )
    REPORT_STATUS = (
        ('draft', 'Draft'),
        ('published', 'Published'),
        ('generating', 'Generating'),
    )
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tutor = models.ForeignKey(TutorProfile, on_delete=models.CASCADE, related_name='reports')
    title = models.CharField(max_length=200)
    type = models.CharField(max_length=50, choices=REPORT_TYPES)
    description = models.TextField(blank=True)
    file = models.FileField(upload_to='tutor/reports/', null=True, blank=True)
    file_size = models.IntegerField(default=0)
    status = models.CharField(max_length=20, choices=REPORT_STATUS, default='draft')
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'tutor_reports'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.title} - {self.tutor.user.email}"