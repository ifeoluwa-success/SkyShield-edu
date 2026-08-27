from rest_framework import serializers
from django.apps import apps
from drf_spectacular.utils import extend_schema_field
from .models import (
    TutorProfile, TeachingMaterial, TeachingSession,
    SessionAttendance, StudentProgress, Exercise, ExerciseAttempt,
    Report
)

def get_user_profile_serializer():
    User = apps.get_model('users', 'User')
    
    class DynamicUserProfileSerializer(serializers.ModelSerializer):
        full_name = serializers.SerializerMethodField()
        
        class Meta:
            model = User
            fields = ['id', 'email', 'username', 'first_name', 'last_name', 'full_name',
                     'role', 'profile_picture', 'organization', 'department']
        
        @extend_schema_field(serializers.CharField())
        def get_full_name(self, obj):
            return obj.get_full_name()
    
    return DynamicUserProfileSerializer


class TutorProfileSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    user = serializers.SerializerMethodField()
    full_name = serializers.SerializerMethodField()
    email = serializers.SerializerMethodField()
    specialization = serializers.ListField(child=serializers.CharField(), default=list)
    qualifications = serializers.ListField(child=serializers.CharField(), default=list)
    created_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    updated_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    
    class Meta:
        model = TutorProfile
        fields = [
            'id', 'user', 'full_name', 'email', 'specialization', 'bio',
            'qualifications', 'experience_years', 'total_students',
            'total_sessions', 'total_meetings', 'average_rating',
            'default_meeting_duration', 'default_max_participants',
            'allow_recording', 'allow_chat', 'allow_screen_share',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'total_students',
                           'total_sessions', 'total_meetings', 'average_rating']
    
    @extend_schema_field(serializers.DictField())
    def get_user(self, obj):
        UserProfileSerializer = get_user_profile_serializer()
        return UserProfileSerializer(obj.user).data
    
    @extend_schema_field(serializers.CharField())
    def get_full_name(self, obj):
        return obj.user.get_full_name()
    
    @extend_schema_field(serializers.EmailField())
    def get_email(self, obj):
        return obj.user.email


class TeachingMaterialSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    tutor_name = serializers.SerializerMethodField()
    file_url = serializers.SerializerMethodField()
    tags = serializers.ListField(child=serializers.CharField(), default=list)
    created_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    updated_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    
    class Meta:
        model = TeachingMaterial
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at', 'views_count', 
                           'downloads_count', 'average_rating']
    
    @extend_schema_field(serializers.CharField())
    def get_tutor_name(self, obj):
        return obj.tutor.user.get_full_name()
    
    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_file_url(self, obj):
        request = self.context.get('request')
        if obj.file and request:
            return request.build_absolute_uri(obj.file.url)
        return None


class TeachingSessionSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    tutor_name = serializers.SerializerMethodField()
    is_full = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    meeting_details = serializers.SerializerMethodField()
    internal_meeting_details = serializers.SerializerMethodField()
    materials = serializers.ListField(child=serializers.UUIDField(), default=list)
    materials_count = serializers.SerializerMethodField()
    meeting_password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    has_meeting_password = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    updated_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    start_time = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ")
    end_time = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ")
    
    class Meta:
        model = TeachingSession
        fields = [
            'id', 'tutor', 'tutor_name', 'title', 'description',
            'session_type', 'platform', 'start_time', 'end_time',
            'timezone', 'meeting_link', 'meeting_id', 'meeting_password',
            'has_meeting_password',
            'internal_meeting', 'internal_meeting_details',
            'max_attendees', 'current_attendees', 'is_cancelled',
            'cancellation_reason', 'recording_url', 'recording_available',
            'materials', 'materials_count', 'status', 'is_full',
            'meeting_details', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'created_at', 'updated_at', 'current_attendees', 'has_meeting_password',
        ]
    
    @extend_schema_field(serializers.CharField())
    def get_tutor_name(self, obj):
        return obj.tutor.user.get_full_name()
    
    @extend_schema_field(serializers.BooleanField())
    def get_is_full(self, obj):
        return obj.current_attendees >= obj.max_attendees

    @extend_schema_field(serializers.BooleanField())
    def get_has_meeting_password(self, obj):
        return bool(obj.meeting_password)
    
    @extend_schema_field(serializers.CharField())
    def get_status(self, obj):
        from django.utils import timezone
        now = timezone.now()
        if obj.is_cancelled:
            return 'cancelled'
        elif now < obj.start_time:
            return 'upcoming'
        elif obj.start_time <= now <= obj.end_time:
            return 'live'
        else:
            return 'ended'
    
    @extend_schema_field(serializers.DictField(allow_null=True))
    def get_meeting_details(self, obj):
        request = self.context.get('request')
        if request and (request.user == obj.tutor.user or request.user.role in ['admin', 'supervisor']):
            return {
                'link': obj.meeting_link,
                'id': obj.meeting_id,
                'has_password': bool(obj.meeting_password),
            }
        return None
    
    @extend_schema_field(serializers.DictField(allow_null=True))
    def get_internal_meeting_details(self, obj):
        if obj.internal_meeting:
            return {
                'id': str(obj.internal_meeting.id),
                'code': obj.internal_meeting.meeting_code,
                'title': obj.internal_meeting.title,
                'status': obj.internal_meeting.status,
                'participant_count': obj.internal_meeting.participant_count,
                'max_participants': obj.internal_meeting.max_participants,
                'scheduled_start': obj.internal_meeting.scheduled_start.strftime("%Y-%m-%dT%H:%M:%S.%fZ") if obj.internal_meeting.scheduled_start else None,
                'scheduled_end': obj.internal_meeting.scheduled_end.strftime("%Y-%m-%dT%H:%M:%S.%fZ") if obj.internal_meeting.scheduled_end else None,
                'actual_start': obj.internal_meeting.actual_start.strftime("%Y-%m-%dT%H:%M:%S.%fZ") if obj.internal_meeting.actual_start else None,
                'actual_end': obj.internal_meeting.actual_end.strftime("%Y-%m-%dT%H:%M:%S.%fZ") if obj.internal_meeting.actual_end else None,
            }
        return None
    
    @extend_schema_field(serializers.IntegerField())
    def get_materials_count(self, obj):
        return obj.materials.count()


class SessionAttendanceSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    student_name = serializers.SerializerMethodField()
    student_email = serializers.SerializerMethodField()
    attendance_duration = serializers.SerializerMethodField()
    joined_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", allow_null=True)
    left_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", allow_null=True)
    
    class Meta:
        model = SessionAttendance
        fields = '__all__'
        read_only_fields = ['id']
    
    @extend_schema_field(serializers.CharField())
    def get_student_name(self, obj):
        return obj.student.get_full_name()
    
    @extend_schema_field(serializers.EmailField())
    def get_student_email(self, obj):
        return obj.student.email
    
    @extend_schema_field(serializers.FloatField())
    def get_attendance_duration(self, obj):
        if obj.joined_at and obj.left_at:
            duration = (obj.left_at - obj.joined_at).total_seconds() / 60
            return round(duration, 2)
        return obj.duration_seconds / 60 if obj.duration_seconds else 0


class StudentProgressSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    student = serializers.SerializerMethodField()
    progress_percentage = serializers.SerializerMethodField()
    meetings_attended_count = serializers.SerializerMethodField()
    completed_materials = serializers.ListField(child=serializers.UUIDField(), default=list)
    completed_sessions = serializers.ListField(child=serializers.UUIDField(), default=list)
    completed_exercises = serializers.ListField(child=serializers.UUIDField(), default=list)
    attended_meetings = serializers.ListField(child=serializers.UUIDField(), default=list)
    strengths = serializers.ListField(child=serializers.CharField(), default=list)
    areas_for_improvement = serializers.ListField(child=serializers.CharField(), default=list)
    last_activity = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", allow_null=True)
    created_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    updated_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    
    class Meta:
        model = StudentProgress
        fields = [
            'id', 'tutor', 'student', 'completed_materials',
            'completed_sessions', 'completed_exercises', 'attended_meetings',
            'meetings_attended_count', 'average_score', 'total_time_spent',
            'last_activity', 'tutor_notes', 'strengths',
            'areas_for_improvement', 'progress_percentage',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    @extend_schema_field(serializers.DictField())
    def get_student(self, obj):
        UserProfileSerializer = get_user_profile_serializer()
        return UserProfileSerializer(obj.student).data
    
    @extend_schema_field(serializers.FloatField())
    def get_progress_percentage(self, obj):
        total_items = 0
        if obj.completed_materials:
            total_items += len(obj.completed_materials)
        if obj.completed_exercises:
            total_items += len(obj.completed_exercises)
        if obj.completed_sessions:
            total_items += len(obj.completed_sessions)
        return min(total_items * 10, 100) if total_items > 0 else 0
    
    @extend_schema_field(serializers.IntegerField())
    def get_meetings_attended_count(self, obj):
        return len(obj.attended_meetings) if obj.attended_meetings else 0


class ExerciseSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    question_count = serializers.SerializerMethodField()
    questions = serializers.ListField(child=serializers.DictField(), default=list)
    answers = serializers.ListField(child=serializers.DictField(), default=list)
    explanations = serializers.DictField(default=dict)
    created_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    updated_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    
    class Meta:
        model = Exercise
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    @extend_schema_field(serializers.IntegerField())
    def get_question_count(self, obj):
        return len(obj.questions) if obj.questions else 0


class ExerciseAttemptSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    student_name = serializers.SerializerMethodField()
    student_email = serializers.SerializerMethodField()
    exercise_title = serializers.SerializerMethodField()
    time_taken_minutes = serializers.SerializerMethodField()
    answers = serializers.ListField(child=serializers.DictField(), default=list)
    started_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    completed_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", allow_null=True)
    
    class Meta:
        model = ExerciseAttempt
        fields = '__all__'
        read_only_fields = ['id', 'started_at']
    
    @extend_schema_field(serializers.CharField())
    def get_student_name(self, obj):
        return obj.student.get_full_name()
    
    @extend_schema_field(serializers.EmailField())
    def get_student_email(self, obj):
        return obj.student.email
    
    @extend_schema_field(serializers.CharField())
    def get_exercise_title(self, obj):
        return obj.exercise.title
    
    @extend_schema_field(serializers.FloatField())
    def get_time_taken_minutes(self, obj):
        return round(obj.time_taken / 60, 2) if obj.time_taken else 0


class ReportSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    file_url = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    updated_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    
    class Meta:
        model = Report
        fields = [
            'id', 'title', 'type', 'description', 'file', 'file_url',
            'file_size', 'status', 'metadata', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'file_size']
    
    def get_file_url(self, obj):
        request = self.context.get('request')
        if obj.file and request:
            return request.build_absolute_uri(obj.file.url)
        return None


class TutorDashboardStatsSerializer(serializers.Serializer):
    total_students = serializers.IntegerField()
    total_materials = serializers.IntegerField()
    total_exercises = serializers.IntegerField()
    total_meetings = serializers.IntegerField()
    upcoming_sessions = serializers.IntegerField()
    upcoming_meetings = serializers.IntegerField()
    recent_uploads = TeachingMaterialSerializer(many=True)
    upcoming_sessions_list = TeachingSessionSerializer(many=True)
    upcoming_meetings_list = serializers.ListField(child=serializers.DictField(), required=False)
    student_performance = serializers.ListField(child=serializers.DictField())


# ==============================================================================
# DETAIL SERIALIZERS (explicit fields to avoid '__all__' concatenation)
# ==============================================================================

class TeachingMaterialDetailSerializer(TeachingMaterialSerializer):
    """Extended serializer with additional fields for detail view"""
    is_owner = serializers.SerializerMethodField()
    download_count = serializers.IntegerField(source='downloads_count', read_only=True)
    
    class Meta(TeachingMaterialSerializer.Meta):
        # Explicitly list all fields from parent plus extras
        fields = [
            'id', 'tutor', 'tutor_name', 'title', 'description', 'material_type',
            'difficulty', 'file', 'file_url', 'video_url', 'content', 'tags',
            'duration_minutes', 'is_published', 'is_featured', 'views_count',
            'downloads_count', 'average_rating', 'created_at', 'updated_at',
            'is_owner', 'download_count'
        ]
    
    def get_is_owner(self, obj):
        request = self.context.get('request')
        if request:
            return obj.tutor.user == request.user
        return False


class TeachingSessionDetailSerializer(TeachingSessionSerializer):
    """Extended serializer with additional fields for detail view"""
    attendees = serializers.SerializerMethodField()
    attendance_rate = serializers.SerializerMethodField()
    
    class Meta(TeachingSessionSerializer.Meta):
        fields = TeachingSessionSerializer.Meta.fields + ['attendees', 'attendance_rate']
    
    def get_attendees(self, obj):
        attendances = obj.attendances.select_related('student').all()
        return [{
            'student_id': str(a.student.id),
            'student_name': a.student.get_full_name() or a.student.username,
            'joined_at': a.joined_at,
            'duration': a.duration_seconds
        } for a in attendances]
    
    def get_attendance_rate(self, obj):
        if obj.max_attendees > 0:
            return round((obj.current_attendees / obj.max_attendees) * 100, 2)
        return 0


class ExerciseDetailSerializer(ExerciseSerializer):
    """Extended serializer with additional fields for detail view"""
    attempts_count = serializers.SerializerMethodField()
    average_score = serializers.SerializerMethodField()
    pass_rate = serializers.SerializerMethodField()
    
    class Meta(ExerciseSerializer.Meta):
        # Override fields to include extras – note: ExerciseSerializer.Meta.fields = '__all__'
        # So we cannot concatenate; we must redefine the whole field list.
        fields = [
            'id', 'tutor', 'title', 'description', 'exercise_type',
            'questions', 'answers', 'explanations', 'time_limit_minutes',
            'passing_score', 'max_attempts', 'due_date', 'is_published',
            'created_at', 'updated_at',
            'question_count', 'attempts_count', 'average_score', 'pass_rate'
        ]
    
    def get_attempts_count(self, obj):
        return obj.attempts.count()
    
    def get_average_score(self, obj):
        attempts = obj.attempts.all()
        if attempts:
            return round(sum(a.score for a in attempts) / len(attempts), 2)
        return 0
    
    def get_pass_rate(self, obj):
        attempts = obj.attempts.all()
        if attempts:
            passed = sum(1 for a in attempts if a.passed)
            return round((passed / len(attempts)) * 100, 2)
        return 0


# ==============================================================================
# TRAINEE EXERCISE SERIALIZER
# ==============================================================================

class TraineeExerciseSerializer(serializers.ModelSerializer):
    """Serializer for exercises shown to trainees (no answers included)."""
    id = serializers.UUIDField(read_only=True)
    tutor_name = serializers.SerializerMethodField()
    question_count = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    score = serializers.SerializerMethodField()

    class Meta:
        model = Exercise
        fields = [
            'id', 'title', 'description', 'exercise_type',
            'time_limit_minutes', 'passing_score', 'max_attempts',
            'due_date',  # <-- ADDED due_date
            'tutor_name', 'question_count', 'status', 'score',
            'created_at', 'updated_at'
        ]

    def get_tutor_name(self, obj):
        return obj.tutor.user.get_full_name() or obj.tutor.user.username

    def get_question_count(self, obj):
        return len(obj.questions) if obj.questions else 0

    def get_status(self, obj):
        user = self.context.get('user')
        if not user or not user.is_authenticated:
            return 'locked'
        attempt = ExerciseAttempt.objects.filter(exercise=obj, student=user).order_by('-attempt_number').first()
        if attempt:
            if attempt.passed:
                return 'completed'
            elif attempt.attempt_number >= obj.max_attempts:
                return 'locked'
            else:
                return 'in_progress'
        return 'pending'

    def get_score(self, obj):
        user = self.context.get('user')
        if not user:
            return None
        attempt = ExerciseAttempt.objects.filter(exercise=obj, student=user, passed=True).first()
        return attempt.score if attempt else None