from django.db import models
from django.conf import settings
from django.contrib.auth import get_user_model
import uuid

User = get_user_model()

class Scenario(models.Model):
    DIFFICULTY_LEVELS = (
        ('beginner', 'Beginner'),
        ('intermediate', 'Intermediate'),
        ('advanced', 'Advanced'),
        ('expert', 'Expert'),
    )
    
    CATEGORIES = (
        ('communication', 'Communication'),
        ('navigation', 'Navigation'),
        ('data_integrity', 'Data Integrity'),
        ('social_engineering', 'Social Engineering'),
        ('ransomware', 'Ransomware'),
        ('unauthorized_access', 'Unauthorized Access'),
    )
    
    THREAT_TYPES = (
        ('jamming', 'Communication Jamming'),
        ('gps_spoofing', 'GPS Spoofing'),
        ('atc_access', 'Unauthorized ATC Access'),
        ('data_corruption', 'Data Corruption'),
        ('phishing', 'Phishing'),
        ('ransomware', 'Ransomware'),
        ('dos', 'Denial of Service'),
        ('man_in_middle', 'Man in the Middle'),
    )
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=200)
    description = models.TextField()
    category = models.CharField(max_length=50, choices=CATEGORIES)
    threat_type = models.CharField(max_length=50, choices=THREAT_TYPES)
    difficulty = models.CharField(max_length=20, choices=DIFFICULTY_LEVELS)
    
    # Scenario content
    initial_state = models.JSONField(help_text="Initial scenario state")
    steps = models.JSONField(help_text="Scenario steps and decision points")
    correct_actions = models.JSONField(help_text="Expected correct actions")
    hints = models.JSONField(default=list, blank=True)
    learning_objectives = models.JSONField(default=list)
    graph = models.JSONField(default=dict)
    escalation_rules = models.JSONField(default=list)
    is_genie_generated = models.BooleanField(default=False)
    genie_template_id = models.CharField(max_length=100, null=True, blank=True)
    
    # Media
    thumbnail = models.ImageField(upload_to='scenarios/thumbnails/', null=True, blank=True)
    intro_video = models.FileField(upload_to='scenarios/videos/', null=True, blank=True)
    supporting_docs = models.JSONField(default=list, blank=True)
    
    # Metadata
    estimated_time = models.IntegerField(help_text="Estimated time in minutes")
    points_possible = models.IntegerField(default=100)
    passing_score = models.IntegerField(default=70)
    max_attempts = models.IntegerField(default=3)
    version = models.CharField(max_length=10, default='1.0')
    is_active = models.BooleanField(default=True)
    is_featured = models.BooleanField(default=False)
    requires_team_participation = models.BooleanField(
        default=False,
        help_text=(
            "Team-training mode: every participant must acknowledge the briefing, "
            "and only the lead operator advances mission steps."
        ),
    )
    tags = models.JSONField(default=list, blank=True)
    
    # Statistics
    times_completed = models.IntegerField(default=0)
    average_score = models.FloatField(default=0.0)
    average_time = models.FloatField(default=0.0)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='created_scenarios')
    
    class Meta:
        db_table = 'scenarios'
        indexes = [
            models.Index(fields=['category']),
            models.Index(fields=['difficulty']),
            models.Index(fields=['threat_type']),
            models.Index(fields=['is_active']),
            models.Index(fields=['is_featured']),
        ]
        ordering = ['difficulty', 'title']

    def __str__(self):
        return f"{self.title} ({self.difficulty})"
    
    def update_stats(self, score, time_spent):
        self.times_completed += 1
        self.average_score = (self.average_score * (self.times_completed - 1) + score) / self.times_completed
        self.average_time = (self.average_time * (self.times_completed - 1) + time_spent) / self.times_completed
        self.save()


class SimulationSession(models.Model):
    STATUS_CHOICES = (
        ('not_started', 'Not Started'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
        ('abandoned', 'Abandoned'),
    )
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='simulation_sessions')
    scenario = models.ForeignKey(Scenario, on_delete=models.CASCADE, related_name='sessions')
    
    # Session state
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='not_started')
    current_step = models.IntegerField(default=0)
    session_state = models.JSONField(default=dict)
    decisions = models.JSONField(default=list)
    
    # Performance metrics
    score = models.FloatField(null=True, blank=True)
    time_spent = models.IntegerField(default=0)
    correct_choices = models.IntegerField(default=0)
    total_choices = models.IntegerField(default=0)
    accuracy_rate = models.FloatField(default=0.0)
    hints_used = models.IntegerField(default=0)
    
    # Attempt tracking
    attempt_number = models.IntegerField(default=1)
    passed = models.BooleanField(default=False)
    
    # Feedback
    feedback = models.TextField(blank=True)
    mistakes = models.JSONField(default=list, blank=True)
    
    # Timestamps
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    last_activity = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'simulation_sessions'
        indexes = [
            models.Index(fields=['user', '-started_at']),
            models.Index(fields=['scenario']),
            models.Index(fields=['status']),
            models.Index(fields=['passed']),
        ]
        unique_together = ['user', 'scenario', 'attempt_number']

    def calculate_accuracy(self):
        if self.total_choices > 0:
            self.accuracy_rate = (self.correct_choices / self.total_choices) * 100
        return self.accuracy_rate
    
    def calculate_score(self):
        base_score = (self.correct_choices / max(self.total_choices, 1)) * 100
        time_penalty = max(0, (self.time_spent - self.scenario.estimated_time * 60) / 60) * 0.5
        hint_penalty = self.hints_used * 2
        final_score = max(0, base_score - time_penalty - hint_penalty)
        self.score = round(final_score, 2)
        self.passed = self.score >= self.scenario.passing_score
        return self.score


class UserDecision(models.Model):
    DECISION_TYPES = (
        ('choice', 'Multiple Choice'),
        ('action', 'Action'),
        ('response', 'Response'),
        ('escalation', 'Escalation'),
    )
    
    session = models.ForeignKey(SimulationSession, on_delete=models.CASCADE, related_name='user_decisions')
    step_number = models.IntegerField()
    decision_type = models.CharField(max_length=20, choices=DECISION_TYPES)
    decision_data = models.JSONField()
    is_correct = models.BooleanField(default=False)
    time_taken = models.IntegerField()
    feedback = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'user_decisions'
        indexes = [
            models.Index(fields=['session', 'step_number']),
        ]
        ordering = ['step_number']


class ScenarioFeedback(models.Model):
    RATINGS = (
        (1, 'Poor'),
        (2, 'Fair'),
        (3, 'Good'),
        (4, 'Very Good'),
        (5, 'Excellent'),
    )
    
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    scenario = models.ForeignKey(Scenario, on_delete=models.CASCADE, related_name='feedbacks')
    rating = models.IntegerField(choices=RATINGS)
    difficulty_rating = models.IntegerField(choices=RATINGS)
    comments = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'scenario_feedback'
        unique_together = ['user', 'scenario']


class ScenarioAchievement(models.Model):
    ACHIEVEMENT_TYPES = (
        ('first_completion', 'First Completion'),
        ('perfect_score', 'Perfect Score'),
        ('speed_demon', 'Speed Demon'),
        ('no_hints', 'No Hints Used'),
        ('multiple_attempts', 'Persistent Learner'),
    )
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='scenario_achievements')
    scenario = models.ForeignKey(Scenario, on_delete=models.CASCADE)
    achievement_type = models.CharField(max_length=50, choices=ACHIEVEMENT_TYPES)
    earned_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'scenario_achievements'
        unique_together = ['user', 'scenario', 'achievement_type']


class ScenarioComment(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    scenario = models.ForeignKey(Scenario, on_delete=models.CASCADE, related_name='comments')
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'scenario_comments'
        ordering = ['-created_at']


class ScenarioBookmark(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='scenario_bookmarks')
    scenario = models.ForeignKey(Scenario, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'scenario_bookmarks'
        unique_together = ['user', 'scenario']


class IncidentRun(models.Model):
    """
    New mission-level session for the simulation engine.
    SimulationSession is kept untouched for backward compatibility.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    scenario = models.ForeignKey(Scenario, on_delete=models.PROTECT, related_name='incident_runs')
    participants = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        through='MissionParticipant',
        related_name='incident_runs'
    )
    phase = models.CharField(
        max_length=20,
        default='briefing',
        choices=[
            ('briefing', 'Briefing'),
            ('detection', 'Detection'),
            ('investigation', 'Investigation'),
            ('containment', 'Containment'),
            ('recovery', 'Recovery'),
            ('review', 'Review'),
        ]
    )
    status = models.CharField(
        max_length=20,
        default='not_started',
        choices=[
            ('not_started', 'Not Started'),
            ('in_progress', 'In Progress'),
            ('completed', 'Completed'),
            ('failed', 'Failed'),
            ('abandoned', 'Abandoned'),
            ('paused', 'Paused'),
        ]
    )
    session_state = models.JSONField(default=dict)
    phase_started_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    score = models.FloatField(null=True, blank=True)
    passed = models.BooleanField(null=True, blank=True)
    genie_scenario_data = models.JSONField(default=dict)
    is_genie_generated = models.BooleanField(default=False)

    class Meta:
        ordering = ['-started_at']
        indexes = [
            models.Index(fields=['status', '-started_at']),
        ]

    def __str__(self):
        return f"IncidentRun {self.id} — {self.scenario.title}"


class MissionParticipant(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    run = models.ForeignKey(IncidentRun, on_delete=models.CASCADE, related_name='mission_participants')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='mission_participations'
    )
    role = models.CharField(
        max_length=20,
        choices=[
            ('lead_operator', 'Lead Operator'),
            ('support_operator', 'Support Operator'),
            ('observer', 'Observer'),
            ('supervisor', 'Supervisor'),
        ]
    )
    joined_at = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(auto_now=True)
    last_heartbeat = models.DateTimeField(
        null=True,
        blank=True,
        help_text='Last WebSocket heartbeat or connect; used for is_online presence.',
    )
    is_active = models.BooleanField(
        default=True,
        help_text='Still a member of this mission (not removed); not WebSocket presence.',
    )
    is_ready = models.BooleanField(default=False)

    class Meta:
        unique_together = [('run', 'user')]
        indexes = [
            models.Index(fields=['run', 'user']),
        ]

    def __str__(self):
        return f"{self.user.username} in run {self.run.id} as {self.role}"


class IncidentEvent(models.Model):
    """
    Append-only event log for a mission run.
    NEVER update or delete records from this model.
    """
    EVENT_TYPES = [
        ('action_submitted', 'Action Submitted'),
        ('phase_changed', 'Phase Changed'),
        ('escalation_triggered', 'Escalation Triggered'),
        ('hint_requested', 'Hint Requested'),
        ('intervention_applied', 'Intervention Applied'),
        ('participant_joined', 'Participant Joined'),
        ('participant_left', 'Participant Left'),
        ('timeout_occurred', 'Timeout Occurred'),
        ('genie_event', 'Genie Event'),
        ('system', 'System'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    run = models.ForeignKey(IncidentRun, on_delete=models.CASCADE, related_name='events')
    event_type = models.CharField(max_length=30, choices=EVENT_TYPES)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='incident_events'
    )
    payload = models.JSONField(default=dict)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['timestamp']
        indexes = [
            models.Index(fields=['run', 'timestamp']),
        ]

    def __str__(self):
        return f"{self.event_type} @ {self.timestamp} in run {self.run.id}"


class ThreatNode(models.Model):
    """
    A node in the branching threat graph for a scenario.
    Represents an attack that can escalate or branch based on decisions.
    """
    SEVERITY_CHOICES = [
        (1, 'Low'),
        (2, 'Medium'),
        (3, 'High'),
        (4, 'Critical'),
        (5, 'Catastrophic'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    scenario = models.ForeignKey(Scenario, on_delete=models.CASCADE, related_name='threat_nodes')
    label = models.CharField(max_length=200)
    severity = models.IntegerField(choices=SEVERITY_CHOICES)
    trigger_condition = models.JSONField()
    consequence_payload = models.JSONField()
    parent = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='children'
    )
    phase = models.CharField(max_length=20)

    class Meta:
        indexes = [
            models.Index(fields=['scenario', 'phase']),
        ]

    def __str__(self):
        return f"{self.label} (severity {self.severity})"


class Course(models.Model):
    """
    A structured course created by a supervisor/instructor.
    Contains ordered modules. Trainee must complete all modules
    in order to earn a certificate.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    title = models.CharField(max_length=200)
    description = models.TextField()
    thumbnail = models.ImageField(
        upload_to='course_thumbnails/', null=True, blank=True)
    threat_focus = models.CharField(max_length=100)
    # e.g. 'GPS Spoofing', 'ADS-B Injection', 'Radar Jamming'
    difficulty = models.IntegerField(
        choices=[(1, 'Beginner'), (2, 'Intermediate'),
                 (3, 'Advanced'), (4, 'Expert')],
        default=1)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name='created_courses')
    is_published = models.BooleanField(default=False)
    estimated_hours = models.FloatField(default=1.0)
    passing_threshold = models.FloatField(default=70.0)
    # minimum average score across all simulation modules to earn cert
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title


class CourseModule(models.Model):
    """
    A single module inside a Course. Ordered by position.
    Can be either a reading module (content only) or a
    simulation checkpoint (requires passing a scenario).
    """
    MODULE_TYPES = [
        ('reading', 'Reading'),
        ('simulation', 'Simulation Checkpoint'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    course = models.ForeignKey(
        Course, on_delete=models.CASCADE, related_name='modules')
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    module_type = models.CharField(
        max_length=20, choices=MODULE_TYPES, default='reading')
    position = models.PositiveIntegerField(default=0)
    # position determines order — 0 is first

    # For reading modules:
    content_body = models.TextField(blank=True)
    # Rich text / markdown content written by supervisor

    # For simulation modules:
    scenario = models.ForeignKey(
        'Scenario', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='course_modules')
    minimum_passing_score = models.FloatField(default=70.0)
    # trainee must score >= this to unlock next module
    max_simulation_attempts = models.IntegerField(default=3)

    class Meta:
        ordering = ['position']
        unique_together = [('course', 'position')]

    def __str__(self):
        return f"{self.course.title} — {self.title} ({self.module_type})"


class CourseEnrollment(models.Model):
    """
    Tracks a trainee's enrollment in a Course.
    Created when trainee enrolls. Tracks overall progress.
    """
    STATUS_CHOICES = [
        ('enrolled', 'Enrolled'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('certificate_issued', 'Certificate Issued'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    course = models.ForeignKey(
        Course, on_delete=models.CASCADE, related_name='enrollments')
    trainee = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='course_enrollments')
    status = models.CharField(
        max_length=30, choices=STATUS_CHOICES, default='enrolled')
    enrolled_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    current_module = models.ForeignKey(
        CourseModule, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='+')
    # tracks which module the trainee is currently on
    average_simulation_score = models.FloatField(null=True, blank=True)
    # recomputed after each simulation module is passed

    class Meta:
        unique_together = [('course', 'trainee')]
        ordering = ['-enrolled_at']

    def __str__(self):
        return f"{self.trainee.username} in {self.course.title}"


class ModuleProgress(models.Model):
    """
    Tracks a trainee's progress on a single CourseModule.
    One record per trainee per module.
    """
    STATUS_CHOICES = [
        ('locked', 'Locked'),
        ('unlocked', 'Unlocked'),
        ('in_progress', 'In Progress'),
        ('passed', 'Passed'),
        ('failed', 'Failed'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    enrollment = models.ForeignKey(
        CourseEnrollment, on_delete=models.CASCADE,
        related_name='module_progresses')
    module = models.ForeignKey(
        CourseModule, on_delete=models.CASCADE,
        related_name='progresses')
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default='locked')
    attempts = models.IntegerField(default=0)
    best_score = models.FloatField(null=True, blank=True)
    passed_at = models.DateTimeField(null=True, blank=True)
    # For reading modules: marked passed when trainee clicks "Mark Complete"
    # For simulation modules: marked passed when SimulationSession
    #   completes with score >= module.minimum_passing_score
    linked_session = models.ForeignKey(
        'SimulationSession', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='module_progresses')
    # the session that achieved the passing score

    class Meta:
        unique_together = [('enrollment', 'module')]

    def __str__(self):
        return (f"{self.enrollment.trainee.username} — "
                f"{self.module.title}: {self.status}")


class CourseCertificate(models.Model):
    """
    Issued automatically when a trainee completes all modules
    in a course with average_simulation_score >= course.passing_threshold.
    One certificate per enrollment.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    enrollment = models.OneToOneField(
        CourseEnrollment, on_delete=models.CASCADE,
        related_name='certificate')
    issued_at = models.DateTimeField(auto_now_add=True)
    certificate_number = models.CharField(
        max_length=50, unique=True)
    # format: SKY-{YEAR}-{UUID4 first 8 chars uppercase}
    final_score = models.FloatField()
    # average across all simulation modules
    issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='issued_certificates')
    # null = auto-issued by system

    def __str__(self):
        return (f"Certificate {self.certificate_number} — "
                f"{self.enrollment.trainee.username} — "
                f"{self.enrollment.course.title}")

    class Meta:
        ordering = ['-issued_at']