from rest_framework import serializers

from .models import Scenario, ScenarioAssignment


class ScenarioWriteSerializer(serializers.ModelSerializer):
    steps = serializers.ListField(child=serializers.DictField(), required=False, default=list)
    hints = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    learning_objectives = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    tags = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    initial_state = serializers.JSONField(required=False, default=dict)
    correct_actions = serializers.JSONField(required=False, default=list)
    graph = serializers.JSONField(required=False, default=dict)
    escalation_rules = serializers.JSONField(required=False, default=list)
    supporting_docs = serializers.JSONField(required=False, default=list)

    class Meta:
        model = Scenario
        fields = [
            'title', 'description', 'category', 'threat_type', 'difficulty',
            'initial_state', 'steps', 'correct_actions', 'hints',
            'learning_objectives', 'graph', 'escalation_rules', 'supporting_docs',
            'estimated_time', 'points_possible', 'passing_score', 'max_attempts',
            'version', 'publish_status', 'is_active', 'is_featured',
            'requires_team_participation', 'tags',
        ]

    def validate(self, attrs):
        if attrs.get('estimated_time', 1) < 1:
            raise serializers.ValidationError({'estimated_time': 'Must be at least 1 minute.'})
        if attrs.get('max_attempts', 1) < 1:
            raise serializers.ValidationError({'max_attempts': 'Must be at least 1.'})
        return attrs


class ScenarioStaffListSerializer(serializers.ModelSerializer):
    assignment_count = serializers.IntegerField(read_only=True, required=False)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Scenario
        fields = [
            'id', 'title', 'category', 'threat_type', 'difficulty',
            'publish_status', 'is_active', 'is_featured', 'max_attempts',
            'times_completed', 'average_score', 'estimated_time',
            'assignment_count', 'created_by_name', 'created_at', 'updated_at',
        ]

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return None


class ScenarioAssignmentSerializer(serializers.ModelSerializer):
    scenario_title = serializers.CharField(source='scenario.title', read_only=True)
    trainee_email = serializers.EmailField(source='trainee.email', read_only=True)
    trainee_name = serializers.SerializerMethodField()
    assigned_by_name = serializers.SerializerMethodField()
    attempts_used = serializers.SerializerMethodField()
    effective_max_attempts = serializers.SerializerMethodField()

    class Meta:
        model = ScenarioAssignment
        fields = [
            'id', 'scenario', 'scenario_title', 'trainee', 'trainee_email', 'trainee_name',
            'assigned_by', 'assigned_by_name', 'max_attempts', 'effective_max_attempts',
            'cooldown_hours', 'due_at', 'status', 'notes', 'notify_on_exhausted',
            'attempts_used', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'assigned_by', 'created_at', 'updated_at']

    def get_trainee_name(self, obj):
        return obj.trainee.get_full_name() or obj.trainee.username

    def get_assigned_by_name(self, obj):
        if obj.assigned_by:
            return obj.assigned_by.get_full_name() or obj.assigned_by.username
        return None

    def get_attempts_used(self, obj):
        from .models import SimulationSession
        return SimulationSession.objects.filter(
            user=obj.trainee, scenario=obj.scenario,
        ).count()

    def get_effective_max_attempts(self, obj):
        return obj.effective_max_attempts()


class ScenarioAssignBulkSerializer(serializers.Serializer):
    trainee_ids = serializers.ListField(child=serializers.UUIDField(), min_length=1)
    max_attempts = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    cooldown_hours = serializers.IntegerField(required=False, min_value=0, default=0)
    due_at = serializers.DateTimeField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')
