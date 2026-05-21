import copy
import logging

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, Q
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.mixins import RetrieveModelMixin
from rest_framework.response import Response

from .models import Scenario, ScenarioAssignment, SimulationSession
from .permissions import IsScenarioAuthor, IsScenarioStaff, user_role
from .scenario_staff_serializers import (
    ScenarioAssignBulkSerializer,
    ScenarioAssignmentSerializer,
    ScenarioStaffListSerializer,
    ScenarioWriteSerializer,
)
from .serializers import ScenarioDetailSerializer

logger = logging.getLogger(__name__)
User = get_user_model()


class ScenarioStaffViewSet(viewsets.ModelViewSet):
    """
    Supervisor/admin scenario authoring and assignment.
    Instructors may list/retrieve for oversight; writes require supervisor or admin.
    """

    permission_classes = [permissions.IsAuthenticated, IsScenarioStaff]
    queryset = Scenario.objects.all().select_related('created_by')

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy', 'duplicate', 'assign', 'revoke_assignment'):
            return [permissions.IsAuthenticated(), IsScenarioAuthor()]
        return [permissions.IsAuthenticated(), IsScenarioStaff()]

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return ScenarioWriteSerializer
        if self.action == 'retrieve':
            return ScenarioDetailSerializer
        if self.action in ('assign', 'list_assignments'):
            return ScenarioAssignmentSerializer
        return ScenarioStaffListSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        status_filter = self.request.query_params.get('publish_status')
        if status_filter:
            qs = qs.filter(publish_status=status_filter)
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(title__icontains=search)
                | Q(description__icontains=search)
                | Q(tags__icontains=search)
            )
        if self.action == 'list':
            qs = qs.annotate(assignment_count=Count('assignments', distinct=True))
        return qs.order_by('-updated_at')

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['user'] = self.request.user
        return ctx

    def perform_create(self, serializer):
        publish_status = serializer.validated_data.get('publish_status', 'draft')
        serializer.save(
            created_by=self.request.user,
            is_active=publish_status == 'active',
        )

    def perform_update(self, serializer):
        instance = serializer.save()
        if 'publish_status' in serializer.validated_data:
            instance.is_active = instance.publish_status == 'active'
            instance.save(update_fields=['is_active'])

    def destroy(self, request, *args, **kwargs):
        """Soft-archive instead of hard delete when sessions exist."""
        instance = self.get_object()
        if SimulationSession.objects.filter(scenario=instance).exists():
            instance.publish_status = 'archived'
            instance.is_active = False
            instance.save(update_fields=['publish_status', 'is_active', 'updated_at'])
            return Response({'message': 'Scenario archived (has session history).'})
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        source = self.get_object()
        payload = {
            'title': request.data.get('title') or f'{source.title} (Copy)',
            'description': source.description,
            'category': source.category,
            'threat_type': source.threat_type,
            'difficulty': source.difficulty,
            'initial_state': copy.deepcopy(source.initial_state or {}),
            'steps': copy.deepcopy(source.steps or []),
            'correct_actions': copy.deepcopy(source.correct_actions or []),
            'hints': copy.deepcopy(source.hints or []),
            'learning_objectives': copy.deepcopy(source.learning_objectives or []),
            'graph': copy.deepcopy(source.graph or {}),
            'escalation_rules': copy.deepcopy(source.escalation_rules or []),
            'supporting_docs': copy.deepcopy(source.supporting_docs or []),
            'estimated_time': source.estimated_time,
            'points_possible': source.points_possible,
            'passing_score': source.passing_score,
            'max_attempts': source.max_attempts,
            'requires_team_participation': source.requires_team_participation,
            'tags': copy.deepcopy(source.tags or []),
            'publish_status': 'draft',
            'is_active': False,
            'is_featured': False,
            'created_by': request.user,
        }
        clone = Scenario.objects.create(**payload)
        ser = ScenarioDetailSerializer(clone, context=self.get_serializer_context())
        return Response(ser.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def assign(self, request, pk=None):
        scenario = self.get_object()
        body = ScenarioAssignBulkSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        trainee_list = list(
            User.objects.filter(
                id__in=body.validated_data['trainee_ids'],
                role='trainee',
            )
        )
        created = []
        for trainee in trainee_list:
            assignment, was_created = ScenarioAssignment.objects.update_or_create(
                scenario=scenario,
                trainee=trainee,
                defaults={
                    'assigned_by': request.user,
                    'max_attempts': body.validated_data.get('max_attempts'),
                    'cooldown_hours': body.validated_data.get('cooldown_hours', 0),
                    'due_at': body.validated_data.get('due_at'),
                    'notes': body.validated_data.get('notes', ''),
                    'status': 'assigned',
                },
            )
            if was_created:
                created.append(assignment)
        return Response({
            'assigned': len(created),
            'updated': len(trainee_list) - len(created),
            'assignments': ScenarioAssignmentSerializer(created, many=True).data,
        })

    @action(detail=True, methods=['get'], url_path='assignments')
    def list_assignments(self, request, pk=None):
        scenario = self.get_object()
        qs = scenario.assignments.select_related('trainee', 'assigned_by').order_by('-created_at')
        trainee_id = request.query_params.get('trainee')
        if trainee_id:
            qs = qs.filter(trainee_id=trainee_id)
        return Response(ScenarioAssignmentSerializer(qs, many=True).data)

    @action(detail=True, methods=['get'], url_path='performance')
    def performance(self, request, pk=None):
        scenario = self.get_object()
        sessions = SimulationSession.objects.filter(scenario=scenario)
        agg = sessions.aggregate(
            total=Count('id'),
            completed=Count('id', filter=Q(status='completed')),
            failed=Count('id', filter=Q(status='failed')),
            abandoned=Count('id', filter=Q(status='abandoned')),
            avg_score=Avg('score'),
        )
        return Response({
            'scenario_id': str(scenario.id),
            'title': scenario.title,
            'sessions': agg,
            'assignments': scenario.assignments.count(),
            'active_assignments': scenario.assignments.filter(
                status__in=['assigned', 'in_progress'],
            ).count(),
        })

    @action(detail=False, methods=['get'], url_path='my-assignments')
    def my_assignments(self, request):
        """Trainee: scenarios assigned to the current user."""
        if user_role(request.user) != 'trainee':
            return Response({'error': 'Trainees only'}, status=status.HTTP_403_FORBIDDEN)
        qs = ScenarioAssignment.objects.filter(
            trainee=request.user,
            status__in=['assigned', 'in_progress'],
        ).select_related('scenario', 'assigned_by')
        return Response(ScenarioAssignmentSerializer(qs, many=True).data)


class ScenarioAssignmentViewSet(RetrieveModelMixin, viewsets.GenericViewSet):
    """Manage individual assignments (revoke, etc.)."""

    permission_classes = [permissions.IsAuthenticated, IsScenarioAuthor]
    queryset = ScenarioAssignment.objects.select_related('scenario', 'trainee', 'assigned_by')
    serializer_class = ScenarioAssignmentSerializer

    @action(detail=True, methods=['post'])
    def revoke(self, request, pk=None):
        assignment = self.get_object()
        assignment.status = 'revoked'
        assignment.save(update_fields=['status', 'updated_at'])
        return Response(ScenarioAssignmentSerializer(assignment).data)
