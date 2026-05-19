from rest_framework import serializers
from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from .models import (
    Scenario, SimulationSession, UserDecision, 
    ScenarioFeedback, ScenarioAchievement, ScenarioComment,
    ScenarioBookmark
)
from apps.analytics.models import UserPerformance


class ScenarioListSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    category_display = serializers.SerializerMethodField()
    threat_type_display = serializers.SerializerMethodField()
    difficulty_display = serializers.SerializerMethodField()
    tags = serializers.ListField(child=serializers.CharField(), default=list)
    completion_rate = serializers.SerializerMethodField()
    user_completed = serializers.SerializerMethodField()
    user_score = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    updated_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    
    class Meta:
        model = Scenario
        fields = [
            'id', 'title', 'description', 'category', 'category_display',
            'threat_type', 'threat_type_display', 'difficulty', 'difficulty_display',
            'thumbnail', 'estimated_time', 'points_possible', 'tags',
            'is_featured', 'times_completed', 'average_score',
            'completion_rate', 'user_completed', 'user_score',
            'created_at', 'updated_at'
        ]
    
    @extend_schema_field(serializers.CharField())
    def get_category_display(self, obj):
        return obj.get_category_display()
    
    @extend_schema_field(serializers.CharField())
    def get_threat_type_display(self, obj):
        return obj.get_threat_type_display()
    
    @extend_schema_field(serializers.CharField())
    def get_difficulty_display(self, obj):
        return obj.get_difficulty_display()
    
    @extend_schema_field(serializers.FloatField())
    def get_completion_rate(self, obj):
        if obj.times_completed > 0:
            return round((obj.times_completed / (obj.times_completed + 1)) * 100, 2)
        return 0
    
    @extend_schema_field(serializers.BooleanField())
    def get_user_completed(self, obj):
        session_map = self.context.get('user_session_by_scenario') or {}
        entry = session_map.get(obj.id)
        if entry is not None:
            return bool(entry.get('completed'))
        user = self.context.get('user')
        if user and user.is_authenticated:
            return SimulationSession.objects.filter(
                user=user, scenario=obj, status='completed'
            ).exists()
        return False
    
    @extend_schema_field(serializers.FloatField(allow_null=True))
    def get_user_score(self, obj):
        session_map = self.context.get('user_session_by_scenario') or {}
        entry = session_map.get(obj.id)
        if entry is not None:
            return entry.get('score')
        user = self.context.get('user')
        if user and user.is_authenticated:
            session = SimulationSession.objects.filter(
                user=user, scenario=obj, status='completed'
            ).order_by('-completed_at').first()
            if session:
                return session.score
        return None


class ScenarioDetailSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    category_display = serializers.SerializerMethodField()
    threat_type_display = serializers.SerializerMethodField()
    difficulty_display = serializers.SerializerMethodField()
    tags = serializers.ListField(child=serializers.CharField(), default=list)
    steps = serializers.ListField(child=serializers.DictField(), default=list)
    hints = serializers.ListField(child=serializers.CharField(), default=list)
    learning_objectives = serializers.ListField(child=serializers.CharField(), default=list)
    supporting_docs = serializers.ListField(child=serializers.DictField(), default=list)
    steps_count = serializers.SerializerMethodField()
    hints_count = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    updated_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    
    class Meta:
        model = Scenario
        fields = [
            'id', 'title', 'description', 'category', 'category_display',
            'threat_type', 'threat_type_display', 'difficulty', 'difficulty_display',
            'initial_state', 'steps', 'steps_count', 'hints', 'hints_count',
            'learning_objectives', 'thumbnail', 'intro_video', 'supporting_docs',
            'estimated_time', 'points_possible', 'passing_score', 'max_attempts',
            'version', 'is_active', 'is_featured', 'requires_team_participation', 'tags',
            'times_completed', 'average_score', 'average_time',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'times_completed', 
                           'average_score', 'average_time']
    
    @extend_schema_field(serializers.CharField())
    def get_category_display(self, obj):
        return obj.get_category_display()
    
    @extend_schema_field(serializers.CharField())
    def get_threat_type_display(self, obj):
        return obj.get_threat_type_display()
    
    @extend_schema_field(serializers.CharField())
    def get_difficulty_display(self, obj):
        return obj.get_difficulty_display()
    
    @extend_schema_field(serializers.IntegerField())
    def get_steps_count(self, obj):
        return len(obj.steps) if obj.steps else 0
    
    @extend_schema_field(serializers.IntegerField())
    def get_hints_count(self, obj):
        return len(obj.hints) if obj.hints else 0


class SimulationSessionSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    scenario = ScenarioListSerializer(read_only=True)
    scenario_id = serializers.PrimaryKeyRelatedField(
        queryset=Scenario.objects.all(), source='scenario', write_only=True
    )
    status_display = serializers.SerializerMethodField()
    session_state = serializers.DictField(default=dict)
    decisions = serializers.ListField(child=serializers.DictField(), default=list)
    mistakes = serializers.ListField(child=serializers.DictField(), default=list)
    time_remaining = serializers.SerializerMethodField()
    progress_percentage = serializers.SerializerMethodField()
    started_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    completed_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True, allow_null=True)
    last_activity = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    
    class Meta:
        model = SimulationSession
        fields = [
            'id', 'user', 'scenario', 'scenario_id', 'status', 'status_display',
            'current_step', 'session_state', 'score', 'time_spent',
            'time_remaining', 'progress_percentage', 'correct_choices', 'total_choices',
            'accuracy_rate', 'hints_used', 'attempt_number', 'passed',
            'feedback', 'decisions', 'mistakes', 'started_at', 'completed_at', 'last_activity'
        ]
        read_only_fields = ['id', 'user', 'started_at', 'score', 'accuracy_rate', 
                           'passed', 'attempt_number', 'last_activity']
    
    @extend_schema_field(serializers.CharField())
    def get_status_display(self, obj):
        return obj.get_status_display()
    
    @extend_schema_field(serializers.IntegerField())
    def get_time_remaining(self, obj):
        if obj.status == 'in_progress' and obj.scenario:
            max_time = obj.scenario.estimated_time * 60
            remaining = max(0, max_time - obj.time_spent)
            return remaining
        return 0
    
    @extend_schema_field(serializers.FloatField())
    def get_progress_percentage(self, obj):
        if obj.scenario and obj.scenario.steps:
            return round((obj.current_step / len(obj.scenario.steps)) * 100, 2)
        return 0


class UserDecisionSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    decision_type_display = serializers.SerializerMethodField()
    decision_data = serializers.DictField()
    created_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    
    class Meta:
        model = UserDecision
        fields = [
            'id', 'session', 'step_number', 'decision_type', 'decision_type_display',
            'decision_data', 'is_correct', 'time_taken', 'feedback', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']
    
    @extend_schema_field(serializers.CharField())
    def get_decision_type_display(self, obj):
        return obj.get_decision_type_display()


class ScenarioFeedbackSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    rating_display = serializers.SerializerMethodField()
    difficulty_rating_display = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    
    class Meta:
        model = ScenarioFeedback
        fields = [
            'id', 'user', 'scenario', 'rating', 'rating_display',
            'difficulty_rating', 'difficulty_rating_display', 'comments', 'created_at'
        ]
        read_only_fields = ['id', 'user', 'created_at']
    
    @extend_schema_field(serializers.CharField())
    def get_rating_display(self, obj):
        return obj.get_rating_display()
    
    @extend_schema_field(serializers.CharField())
    def get_difficulty_rating_display(self, obj):
        return obj.get_difficulty_rating_display()


class ScenarioAchievementSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    achievement_type_display = serializers.SerializerMethodField()
    scenario_title = serializers.CharField(source='scenario.title', read_only=True)
    earned_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    
    class Meta:
        model = ScenarioAchievement
        fields = [
            'id', 'user', 'scenario', 'scenario_title', 'achievement_type',
            'achievement_type_display', 'earned_at'
        ]
        read_only_fields = ['id', 'user', 'earned_at']
    
    @extend_schema_field(serializers.CharField())
    def get_achievement_type_display(self, obj):
        return obj.get_achievement_type_display()


class ScenarioCommentSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    user_name = serializers.SerializerMethodField()
    user_avatar = serializers.SerializerMethodField()
    user_role = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    updated_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    
    class Meta:
        model = ScenarioComment
        fields = [
            'id', 'user', 'user_name', 'user_avatar', 'user_role',
            'content', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'user', 'created_at', 'updated_at']
    
    @extend_schema_field(serializers.CharField())
    def get_user_name(self, obj):
        return obj.user.get_full_name() or obj.user.username
    
    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_user_avatar(self, obj):
        if obj.user.profile_picture:
            return obj.user.profile_picture.url
        return None
    
    @extend_schema_field(serializers.CharField())
    def get_user_role(self, obj):
        return obj.user.get_role_display() if hasattr(obj.user, 'get_role_display') else obj.user.role


class ScenarioBookmarkSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    scenario = ScenarioListSerializer(read_only=True)
    created_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    
    class Meta:
        model = ScenarioBookmark
        fields = ['id', 'user', 'scenario', 'created_at']
        read_only_fields = ['id', 'user', 'created_at']


class StartSimulationSerializer(serializers.Serializer):
    scenario_id = serializers.UUIDField(required=True)


class SubmitDecisionSerializer(serializers.Serializer):
    session_id = serializers.UUIDField(required=True)
    step_number = serializers.IntegerField(required=True, min_value=0)
    decision_type = serializers.ChoiceField(choices=UserDecision.DECISION_TYPES)
    decision_data = serializers.JSONField()
    time_taken = serializers.IntegerField(required=True, min_value=0)


class CompleteSimulationSerializer(serializers.Serializer):
    session_id = serializers.UUIDField(required=True)


class HintRequestSerializer(serializers.Serializer):
    session_id = serializers.UUIDField(required=True)
    step_number = serializers.IntegerField(required=True)


class SimulationSummarySerializer(serializers.Serializer):
    total_steps = serializers.IntegerField()
    correct_decisions = serializers.IntegerField()
    incorrect_decisions = serializers.IntegerField()
    accuracy = serializers.FloatField()
    time_spent = serializers.IntegerField()
    average_time_per_decision = serializers.FloatField()
    hints_used = serializers.IntegerField()
    challenging_steps = serializers.ListField(child=serializers.DictField())
    score = serializers.FloatField()
    passed = serializers.BooleanField()


# ==============================================================================
# NEW: Certification Serializer
# ==============================================================================

class CertificationSerializer(serializers.Serializer):
    """Serializer for certifications derived from user's simulation performance."""
    id = serializers.CharField()
    title = serializers.CharField()
    level = serializers.CharField()
    category = serializers.CharField()
    progress = serializers.IntegerField()
    status = serializers.CharField()
    score = serializers.IntegerField(required=False, allow_null=True)
    duration = serializers.CharField()
    modules = serializers.IntegerField()
    completedModules = serializers.IntegerField()
    expirationDate = serializers.CharField(required=False, allow_null=True)
    issuedDate = serializers.CharField(required=False, allow_null=True)
    description = serializers.CharField()
    icon = serializers.CharField()
    color = serializers.CharField()
    requirements = serializers.ListField(child=serializers.CharField())


# ==============================================================================
# NEW: Incident Run Serializers (Mission Engine)
# ==============================================================================

from .models import IncidentRun, MissionParticipant, IncidentEvent, ThreatNode


ScenarioSerializer = ScenarioDetailSerializer


class IncidentRunListSerializer(serializers.ModelSerializer):
    """Lightweight — for list views"""
    scenario_title = serializers.CharField(source='scenario.title', read_only=True)
    participant_count = serializers.SerializerMethodField()

    def get_participant_count(self, obj):
        annotated = getattr(obj, '_participant_count', None)
        if annotated is not None:
            return annotated
        return obj.mission_participants.count()

    class Meta:
        model = IncidentRun
        fields = [
            'id', 'scenario_title', 'phase', 'status',
            'started_at', 'score', 'passed', 'participant_count',
            'is_genie_generated'
        ]


class IncidentRunSerializer(serializers.ModelSerializer):
    """Full detail — for retrieve and state views"""
    scenario = ScenarioSerializer(read_only=True)
    time_remaining = serializers.SerializerMethodField()
    participant_count = serializers.SerializerMethodField()

    def get_time_remaining(self, obj):
        from .state_machine import MissionStateMachine
        sm = MissionStateMachine(obj.phase)
        return sm.get_time_remaining(obj.phase_started_at)

    def get_participant_count(self, obj):
        return obj.mission_participants.count()

    class Meta:
        model = IncidentRun
        fields = '__all__'


class MissionParticipantSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    email = serializers.CharField(source='user.email', read_only=True)
    is_online = serializers.SerializerMethodField()

    class Meta:
        model = MissionParticipant
        fields = [
            'id', 'username', 'email', 'role', 'joined_at',
            'is_active', 'is_ready', 'last_seen', 'last_heartbeat', 'is_online',
        ]

    def get_is_online(self, obj):
        from datetime import timedelta

        from django.utils import timezone

        now = timezone.now()
        if obj.last_heartbeat and (now - obj.last_heartbeat) < timedelta(seconds=90):
            return True
        if obj.last_seen and (now - obj.last_seen) < timedelta(seconds=90):
            return True
        return False


class IncidentEventSerializer(serializers.ModelSerializer):
    actor_username = serializers.CharField(source='actor.username', read_only=True, allow_null=True)

    class Meta:
        model = IncidentEvent
        fields = ['id', 'run', 'event_type', 'actor_username', 'payload', 'timestamp']
        read_only_fields = fields


class ThreatNodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ThreatNode
        fields = '__all__'


class MissionActionSerializer(serializers.Serializer):
    """Validates incoming action payload from trainee."""
    action_type = serializers.CharField(required=True)
    step_id = serializers.CharField(required=True)
    decision_data = serializers.JSONField(required=True)
    timestamp_client = serializers.FloatField(required=False)


class SupervisorInterventionSerializer(serializers.Serializer):
    """Validates supervisor intervention payload."""
    INTERVENTION_TYPES = [
        'INJECT_THREAT', 'PAUSE', 'FORCE_PHASE',
        'OVERRIDE_DECISION', 'REDUCE_TIMER'
    ]
    type = serializers.ChoiceField(choices=INTERVENTION_TYPES)
    data = serializers.JSONField(required=False, default=dict)