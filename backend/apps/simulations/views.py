from rest_framework import status, generics, permissions, viewsets, serializers
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from django.utils import timezone
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiResponse, OpenApiTypes
from .models import (
    Scenario, SimulationSession, UserDecision, ScenarioFeedback,
    ScenarioAchievement, ScenarioComment, ScenarioBookmark
)
from .serializers import (
    ScenarioListSerializer, ScenarioDetailSerializer, SimulationSessionSerializer,
    UserDecisionSerializer, ScenarioFeedbackSerializer, ScenarioAchievementSerializer,
    ScenarioCommentSerializer, ScenarioBookmarkSerializer, StartSimulationSerializer,
    SubmitDecisionSerializer, CompleteSimulationSerializer, HintRequestSerializer,
    SimulationSummarySerializer, CertificationSerializer
)
import logging
import json

logger = logging.getLogger(__name__)


# ==============================================================================
# SERIALIZERS FOR APIVIEWS
# ==============================================================================

class FeedbackResponseSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    user = serializers.UUIDField()
    scenario = serializers.UUIDField()
    rating = serializers.IntegerField()
    rating_display = serializers.CharField()
    difficulty_rating = serializers.IntegerField()
    difficulty_rating_display = serializers.CharField()
    comments = serializers.CharField(allow_blank=True)
    created_at = serializers.DateTimeField()


class FeedbackGetResponseSerializer(serializers.Serializer):
    feedback = serializers.DictField(allow_null=True)


# ==============================================================================
# VIEWSETS
# ==============================================================================

class ScenarioViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing scenarios with filtering capabilities.
    Supports filtering by category, difficulty, threat type, and search.
    """
    permission_classes = [permissions.IsAuthenticated]
    queryset = Scenario.objects.filter(is_active=True)
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Scenario.objects.none()

        user = self.request.user
        if not user.is_authenticated:
            return Scenario.objects.none()

        queryset = super().get_queryset()

        # Apply filters
        category = self.request.query_params.get('category')
        difficulty = self.request.query_params.get('difficulty')
        threat_type = self.request.query_params.get('threat_type')
        search = self.request.query_params.get('search')
        featured = self.request.query_params.get('featured')

        if category:
            queryset = queryset.filter(category=category)
        if difficulty:
            queryset = queryset.filter(difficulty=difficulty)
        if threat_type:
            queryset = queryset.filter(threat_type=threat_type)
        if featured:
            queryset = queryset.filter(is_featured=True)
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search) |
                Q(description__icontains=search) |
                Q(tags__icontains=search)
            )

        if self.action == 'list':
            queryset = queryset.defer(
                'graph',
                'correct_actions',
                'escalation_rules',
                'initial_state',
                'supporting_docs',
            )

        return queryset

    def get_serializer_class(self):
        if self.action == 'list':
            return ScenarioListSerializer
        return ScenarioDetailSerializer

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['user'] = self.request.user
        if self.action == 'list':
            queryset = self.filter_queryset(self.get_queryset())
            scenario_ids = list(queryset.values_list('id', flat=True))
            from .query_helpers import scenario_user_session_map

            context['user_session_by_scenario'] = scenario_user_session_map(
                self.request.user, scenario_ids
            )
        return context

    @extend_schema(
        description="List all scenarios with optional filters",
        parameters=[
            OpenApiParameter('category', OpenApiTypes.STR,
                            description='Filter by category'),
            OpenApiParameter('difficulty', OpenApiTypes.STR,
                            description='Filter by difficulty level'),
            OpenApiParameter('threat_type', OpenApiTypes.STR,
                            description='Filter by threat type'),
            OpenApiParameter('search', OpenApiTypes.STR,
                            description='Search in title, description, tags'),
            OpenApiParameter('featured', OpenApiTypes.BOOL,
                            description='Filter featured scenarios'),
        ],
        responses={200: ScenarioListSerializer(many=True)}
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @extend_schema(
        description="Get detailed scenario information",
        responses={200: ScenarioDetailSerializer()}
    )
    def retrieve(self, request, *args, **kwargs):
        return super().retrieve(request, *args, **kwargs)

    @extend_schema(
        description="Get personalized scenario recommendations",
        responses={200: ScenarioListSerializer(many=True)}
    )
    @action(detail=False, methods=['get'])
    def recommended(self, request):
        """
        Get personalized scenario recommendations based on user's performance.
        """
        user = request.user

        # Import here to avoid circular import
        from apps.analytics.models import UserPerformance

        # Get user's performance data
        performance = UserPerformance.objects.filter(user=user).first()

        if performance and performance.weak_areas:
            # Recommend scenarios targeting weak areas
            recommended = Scenario.objects.filter(
                is_active=True,
                threat_type__in=performance.weak_areas
            )[:5]
        else:
            # Start with beginner scenarios
            recommended = Scenario.objects.filter(
                is_active=True,
                difficulty='beginner'
            )[:5]

        # Add popular scenarios if we don't have enough
        if recommended.count() < 3:
            popular = Scenario.objects.filter(
                is_active=True
            ).order_by('-times_completed')[:5]
            # Combine and remove duplicates
            recommended_ids = set(recommended.values_list('id', flat=True))
            for scenario in popular:
                if scenario.id not in recommended_ids and len(recommended) < 5:
                    recommended = list(recommended) + [scenario]

        from .query_helpers import scenario_user_session_map

        if hasattr(recommended, 'values_list'):
            scenario_ids = list(recommended.values_list('id', flat=True))
        else:
            scenario_ids = [s.id for s in recommended]
        serializer = ScenarioListSerializer(
            recommended,
            many=True,
            context={
                'user': request.user,
                'user_session_by_scenario': scenario_user_session_map(
                    request.user, scenario_ids
                ),
            },
        )
        return Response(serializer.data)

    @extend_schema(
        description="Toggle bookmark for a scenario",
        responses={200: OpenApiResponse(description="Bookmark status")}
    )
    @action(detail=True, methods=['post'])
    def bookmark(self, request, pk=None):
        """
        Toggle bookmark for a scenario.
        """
        scenario = self.get_object()
        bookmark, created = ScenarioBookmark.objects.get_or_create(
            user=request.user,
            scenario=scenario
        )
        if not created:
            bookmark.delete()
            return Response({'bookmarked': False})
        return Response({'bookmarked': True})

    @extend_schema(
        description="Get all bookmarked scenarios for the user",
        responses={200: ScenarioListSerializer(many=True)}
    )
    @action(detail=False, methods=['get'])
    def bookmarks(self, request):
        """
        Get all bookmarked scenarios for the user.
        """
        bookmarks = ScenarioBookmark.objects.filter(
            user=request.user
        ).select_related('scenario')
        scenarios = [b.scenario for b in bookmarks]
        from .query_helpers import scenario_user_session_map

        scenario_ids = [s.id for s in scenarios]
        serializer = ScenarioListSerializer(
            scenarios,
            many=True,
            context={
                'user': request.user,
                'user_session_by_scenario': scenario_user_session_map(
                    request.user, scenario_ids
                ),
            },
        )
        return Response(serializer.data)


class SimulationSessionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing simulation sessions.
    Handles starting sessions, submitting decisions, requesting hints, etc.
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = SimulationSessionSerializer
    queryset = SimulationSession.objects.all()
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return SimulationSession.objects.none()

        user = self.request.user
        if not user.is_authenticated:
            return SimulationSession.objects.none()

        return SimulationSession.objects.filter(
            user=user
        ).select_related('scenario')

    @extend_schema(
        description="Start a new simulation session",
        request=StartSimulationSerializer,
        responses={
            201: SimulationSessionSerializer(),
            400: "Bad Request",
            404: "Scenario not found"
        }
    )
    @action(detail=False, methods=['post'])
    def start(self, request):
        """
        Start a new simulation session for a scenario.
        """
        serializer = StartSimulationSerializer(data=request.data)
        if serializer.is_valid():
            scenario_id = serializer.validated_data['scenario_id']

            try:
                scenario = Scenario.objects.get(id=scenario_id, is_active=True)
            except Scenario.DoesNotExist:
                return Response(
                    {'error': 'Scenario not found'},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Check for existing in-progress session
            existing = SimulationSession.objects.filter(
                user=request.user,
                scenario=scenario,
                status='in_progress'
            ).first()

            if existing:
                serializer = self.get_serializer(existing)
                return Response(serializer.data)

            # Check attempt limit
            attempts = SimulationSession.objects.filter(
                user=request.user,
                scenario=scenario
            ).count()

            if attempts >= scenario.max_attempts:
                return Response(
                    {'error': f'Maximum attempts ({scenario.max_attempts}) reached. Please try other scenarios.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Create new session
            session = SimulationSession.objects.create(
                user=request.user,
                scenario=scenario,
                status='in_progress',
                session_state=scenario.initial_state,
                attempt_number=attempts + 1
            )

            # Log activity
            try:
                from apps.users.models import UserActivity
                UserActivity.objects.create(
                    user=request.user,
                    activity_type='simulation_start',
                    metadata={'scenario_id': str(scenario.id), 'scenario_title': scenario.title}
                )
            except ImportError:
                logger.warning("UserActivity model not available for logging")

            serializer = self.get_serializer(session)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @extend_schema(
        description="Submit a decision for the current step",
        request=SubmitDecisionSerializer,
        responses={
            200: OpenApiResponse(description="Decision processed"),
            400: "Bad Request",
            404: "Session not found"
        }
    )
    @action(detail=False, methods=['post'])
    def submit_decision(self, request):
        """
        Submit a decision for the current step in a simulation.
        """
        serializer = SubmitDecisionSerializer(data=request.data)
        if serializer.is_valid():
            try:
                session = SimulationSession.objects.select_related('scenario').get(
                    id=serializer.validated_data['session_id'],
                    user=request.user,
                    status='in_progress'
                )
            except SimulationSession.DoesNotExist:
                return Response(
                    {'error': 'Active session not found'},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Check if step number is valid
            if session.current_step >= len(session.scenario.steps):
                return Response(
                    {'error': 'Simulation already completed'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Get current step data
            try:
                step_data = session.scenario.steps[session.current_step]
            except (IndexError, KeyError):
                return Response(
                    {'error': 'Invalid step data in scenario'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

            # Validate decision
            is_correct = self.validate_decision(
                step_data,
                serializer.validated_data['decision_data']
            )

            # Record decision
            decision = UserDecision.objects.create(
                session=session,
                step_number=session.current_step,
                decision_type=serializer.validated_data['decision_type'],
                decision_data=serializer.validated_data['decision_data'],
                is_correct=is_correct,
                time_taken=serializer.validated_data['time_taken']
            )

            # Update session metrics
            session.total_choices += 1
            if is_correct:
                session.correct_choices += 1
            else:
                # Track mistake
                if 'mistakes' not in session.session_state:
                    session.session_state['mistakes'] = []
                session.session_state['mistakes'].append({
                    'step': session.current_step,
                    'decision': serializer.validated_data['decision_data'],
                    'time': serializer.validated_data['time_taken']
                })

            session.time_spent += decision.time_taken
            session.session_state = self.update_state(
                session.session_state,
                step_data,
                serializer.validated_data['decision_data']
            )
            session.calculate_accuracy()

            # Move to next step or complete
            if session.current_step + 1 < len(session.scenario.steps):
                session.current_step += 1
                session.save()

                # Get next step info
                next_step = session.scenario.steps[session.current_step]
                return Response({
                    'correct': is_correct,
                    'feedback': step_data.get('feedback', {}),
                    'next_step': {
                        'number': session.current_step,
                        'title': next_step.get('title', ''),
                        'description': next_step.get('description', ''),
                        'options': next_step.get('options', [])
                    },
                    'session': SimulationSessionSerializer(session, context={'request': request}).data
                })
            else:
                # Complete simulation
                session.status = 'completed'
                session.completed_at = timezone.now()
                session.calculate_score()
                session.save()

                # Update user stats
                user = request.user
                old_total = user.total_score
                old_count = user.simulations_completed
                user.total_score = (old_total * old_count + session.score) / (old_count + 1)
                user.simulations_completed += 1
                user.save()

                # Update scenario stats
                session.scenario.update_stats(session.score, session.time_spent)

                # Check for achievements
                self.check_achievements(session)

                # Log activity
                try:
                    from apps.users.models import UserActivity
                    UserActivity.objects.create(
                        user=user,
                        activity_type='simulation_complete',
                        metadata={
                            'scenario_id': str(session.scenario.id),
                            'scenario_title': session.scenario.title,
                            'score': session.score,
                            'passed': session.passed
                        }
                    )
                except ImportError:
                    logger.warning("UserActivity model not available for logging")

                # Update ML model - using safe import
                try:
                    from apps.analytics.services import AdaptiveLearningService
                    AdaptiveLearningService.update_user_profile(user, session)
                except ImportError:
                    logger.warning("AdaptiveLearningService not available for ML update")

                # Course pipeline hook
                if session.status == 'completed':
                    try:
                        from .course_service import CourseService
                        CourseService().record_simulation_result(session.id, request.user)
                    except Exception as e:
                        # Never let course pipeline failure break simulation completion
                        import logging
                        logging.getLogger(__name__).error(
                            f"CourseService hook failed for session {session.id}: {e}")

                # Generate completion summary
                summary = self.generate_summary(session)

                return Response({
                    'completed': True,
                    'score': session.score,
                    'passed': session.passed,
                    'feedback': step_data.get('feedback', {}),
                    'summary': summary,
                    'session': SimulationSessionSerializer(session, context={'request': request}).data
                })

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @extend_schema(
        description="Request a hint for the current step",
        request=HintRequestSerializer,
        responses={
            200: OpenApiResponse(description="Hint provided"),
            400: "Bad Request",
            404: "Session not found"
        }
    )
    @action(detail=False, methods=['post'])
    def request_hint(self, request):
        """
        Request a hint for the current step.
        """
        serializer = HintRequestSerializer(data=request.data)
        if serializer.is_valid():
            try:
                session = SimulationSession.objects.select_related('scenario').get(
                    id=serializer.validated_data['session_id'],
                    user=request.user,
                    status='in_progress'
                )
            except SimulationSession.DoesNotExist:
                return Response(
                    {'error': 'Active session not found'},
                    status=status.HTTP_404_NOT_FOUND
                )

            step_number = serializer.validated_data['step_number']

            if step_number != session.current_step:
                return Response(
                    {'error': 'Invalid step number'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Get hint for current step
            try:
                step_data = session.scenario.steps[step_number]
                hints = step_data.get('hints', [])

                if session.hints_used >= len(hints):
                    return Response({
                        'hint': 'No more hints available for this step.',
                        'hints_used': session.hints_used,
                        'hints_remaining': 0
                    })

                hint = hints[session.hints_used]
                session.hints_used += 1
                session.save()

                return Response({
                    'hint': hint,
                    'hints_used': session.hints_used,
                    'hints_remaining': len(hints) - session.hints_used
                })

            except (IndexError, KeyError):
                return Response({
                    'hint': 'No hints available for this step.',
                    'hints_used': session.hints_used
                })

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @extend_schema(
        description="Abandon an in-progress simulation",
        responses={200: OpenApiResponse(description="Simulation abandoned")}
    )
    @action(detail=True, methods=['post'])
    def abandon(self, request, pk=None):
        """
        Abandon an in-progress simulation session.
        """
        try:
            session = self.get_queryset().get(id=pk, status='in_progress')
            session.status = 'abandoned'
            session.completed_at = timezone.now()
            session.save()
            return Response({'message': 'Simulation abandoned successfully'})
        except SimulationSession.DoesNotExist:
            return Response(
                {'error': 'Active session not found'},
                status=status.HTTP_404_NOT_FOUND
            )

    @extend_schema(
        description="Get decision history for a completed session",
        responses={
            200: OpenApiResponse(description="Session history"),
            404: "Session not found"
        }
    )
    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        """
        Get decision history for a completed session.
        """
        try:
            session = self.get_queryset().get(id=pk, status='completed')
            decisions = UserDecision.objects.filter(session=session).order_by('step_number')
            serializer = UserDecisionSerializer(decisions, many=True)
            return Response({
                'session': SimulationSessionSerializer(session, context={'request': request}).data,
                'decisions': serializer.data
            })
        except SimulationSession.DoesNotExist:
            return Response(
                {'error': 'Completed session not found'},
                status=status.HTTP_404_NOT_FOUND
            )

    def validate_decision(self, step_data, decision_data):
        """
        Validate if the submitted decision is correct.

        Args:
            step_data: Dictionary containing step information
            decision_data: The decision data submitted by user

        Returns:
            Boolean indicating if decision is correct
        """
        correct_actions = step_data.get('correct_actions', [])

        # Handle different decision data formats
        if isinstance(decision_data, dict):
            decision_id = decision_data.get('id') or decision_data.get('choice_id')
        else:
            decision_id = decision_data

        return decision_id in correct_actions

    def update_state(self, current_state, step_data, decision_data):
        """
        Update session state based on the decision made.

        Args:
            current_state: Current session state dictionary
            step_data: Step data dictionary
            decision_data: The decision made by user

        Returns:
            Updated state dictionary
        """
        new_state = current_state.copy() if current_state else {}

        # Apply state updates from step data
        if 'state_updates' in step_data:
            for key, value in step_data['state_updates'].items():
                new_state[key] = value

        # Track visited steps
        if 'visited_steps' not in new_state:
            new_state['visited_steps'] = []

        step_number = step_data.get('step_number', len(new_state['visited_steps']))
        if step_number not in new_state['visited_steps']:
            new_state['visited_steps'].append(step_number)

        return new_state

    def check_achievements(self, session):
        """
        Check and award achievements for completed sessions.
        """
        user = session.user
        scenario = session.scenario

        # First completion
        if not ScenarioAchievement.objects.filter(
            user=user, scenario=scenario, achievement_type='first_completion'
        ).exists():
            ScenarioAchievement.objects.create(
                user=user,
                scenario=scenario,
                achievement_type='first_completion'
            )

        # Perfect score
        if session.score == 100 and not ScenarioAchievement.objects.filter(
            user=user, scenario=scenario, achievement_type='perfect_score'
        ).exists():
            ScenarioAchievement.objects.create(
                user=user,
                scenario=scenario,
                achievement_type='perfect_score'
            )

        # No hints used
        if session.hints_used == 0 and not ScenarioAchievement.objects.filter(
            user=user, scenario=scenario, achievement_type='no_hints'
        ).exists():
            ScenarioAchievement.objects.create(
                user=user,
                scenario=scenario,
                achievement_type='no_hints'
            )

        # Speed demon (completed faster than 75% of users)
        all_sessions = SimulationSession.objects.filter(
            scenario=scenario,
            status='completed'
        )
        if all_sessions.count() > 5:
            times = list(all_sessions.values_list('time_spent', flat=True))
            times.sort()
            threshold = times[int(len(times) * 0.25)] # Top 25% fastest
            if session.time_spent <= threshold and not ScenarioAchievement.objects.filter(
                user=user, scenario=scenario, achievement_type='speed_demon'
            ).exists():
                ScenarioAchievement.objects.create(
                    user=user,
                    scenario=scenario,
                    achievement_type='speed_demon'
                )

    def generate_summary(self, session):
        """
        Generate a completion summary for the session.
        """
        decisions = UserDecision.objects.filter(session=session)
        correct_decisions = decisions.filter(is_correct=True).count()
        total_decisions = decisions.count()

        # Calculate average time per decision
        avg_time = session.time_spent / total_decisions if total_decisions > 0 else 0

        # Identify challenging steps (where user took longer or made mistakes)
        challenging_steps = []
        for decision in decisions:
            if not decision.is_correct or decision.time_taken > avg_time * 1.5:
                challenging_steps.append({
                    'step': decision.step_number,
                    'time_taken': decision.time_taken,
                    'was_correct': decision.is_correct
                })

        return {
            'total_steps': len(session.scenario.steps),
            'correct_decisions': correct_decisions,
            'incorrect_decisions': total_decisions - correct_decisions,
            'accuracy': round(session.accuracy_rate, 2),
            'time_spent': session.time_spent,
            'average_time_per_decision': round(avg_time, 2),
            'hints_used': session.hints_used,
            'challenging_steps': challenging_steps[:5],
            'score': session.score,
            'passed': session.passed
        }


class FeedbackView(APIView):
    """
    API view for submitting scenario feedback.
    """
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    @extend_schema(
        request=ScenarioFeedbackSerializer,
        responses={
            200: FeedbackResponseSerializer,
            201: FeedbackResponseSerializer,
            400: OpenApiResponse(description="Bad Request")
        }
    )
    def post(self, request):
        serializer = ScenarioFeedbackSerializer(data=request.data)
        if serializer.is_valid():
            # Check if user already provided feedback for this scenario
            scenario_id = request.data.get('scenario')
            existing = ScenarioFeedback.objects.filter(
                user=request.user,
                scenario_id=scenario_id
            ).first()

            if existing:
                # Update existing feedback
                for key, value in serializer.validated_data.items():
                    setattr(existing, key, value)
                existing.save()
                serializer = ScenarioFeedbackSerializer(existing)
                return Response(serializer.data, status=status.HTTP_200_OK)
            else:
                # Create new feedback
                serializer.save(user=request.user)
                return Response(serializer.data, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @extend_schema(
        parameters=[
            OpenApiParameter(name='scenario', type=str, location=OpenApiParameter.QUERY, required=True, description='Scenario ID'),
        ],
        responses={
            200: ScenarioFeedbackSerializer,
            404: OpenApiResponse(description="Feedback not found")
        }
    )
    def get(self, request):
        """
        Get user's feedback for a specific scenario.
        """
        scenario_id = request.query_params.get('scenario')
        if scenario_id:
            feedback = ScenarioFeedback.objects.filter(
                user=request.user,
                scenario_id=scenario_id
            ).first()
            if feedback:
                serializer = ScenarioFeedbackSerializer(feedback)
                return Response(serializer.data)

        return Response({'feedback': None})


class CommentViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing comments on scenarios.
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ScenarioCommentSerializer
    queryset = ScenarioComment.objects.all()
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return ScenarioComment.objects.none()

        user = self.request.user
        if not user.is_authenticated:
            return ScenarioComment.objects.none()

        # Protect against missing scenario_pk
        scenario_id = self.kwargs.get('scenario_pk')
        if scenario_id:
            return ScenarioComment.objects.filter(
                scenario_id=scenario_id
            ).select_related('user').order_by('-created_at')

        # Fallback: all user comments
        return ScenarioComment.objects.filter(
            user=user
        ).select_related('user').order_by('-created_at')

    @extend_schema(
        description="List comments for a scenario",
        responses={200: ScenarioCommentSerializer(many=True)}
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @extend_schema(
        description="Create a new comment",
        request=ScenarioCommentSerializer,
        responses={201: ScenarioCommentSerializer()}
    )
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    @extend_schema(
        description="Retrieve a specific comment",
        responses={200: ScenarioCommentSerializer()}
    )
    def retrieve(self, request, *args, **kwargs):
        return super().retrieve(request, *args, **kwargs)

    @extend_schema(
        description="Update a comment",
        request=ScenarioCommentSerializer,
        responses={200: ScenarioCommentSerializer()}
    )
    def update(self, request, *args, **kwargs):
        return super().update(request, *args, **kwargs)

    @extend_schema(
        description="Partially update a comment",
        request=ScenarioCommentSerializer,
        responses={200: ScenarioCommentSerializer()}
    )
    def partial_update(self, request, *args, **kwargs):
        return super().partial_update(request, *args, **kwargs)

    @extend_schema(
        description="Delete a comment",
        responses={204: "No Content"}
    )
    def destroy(self, request, *args, **kwargs):
        comment = self.get_object()
        # Only allow user who created comment or admin to delete
        if comment.user == request.user or request.user.role in ['admin', 'supervisor']:
            return super().destroy(request, *args, **kwargs)
        return Response(
            {'error': 'You do not have permission to delete this comment'},
            status=status.HTTP_403_FORBIDDEN
        )

    def perform_create(self, serializer):
        serializer.save(
            user=self.request.user,
            scenario_id=self.kwargs['scenario_pk']
        )

    def perform_update(self, serializer):
        serializer.save(is_edited=True)


class AchievementViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing user achievements.
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ScenarioAchievementSerializer
    queryset = ScenarioAchievement.objects.all()
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return ScenarioAchievement.objects.none()

        user = self.request.user
        if not user.is_authenticated:
            return ScenarioAchievement.objects.none()

        return ScenarioAchievement.objects.filter(
            user=user
        ).select_related('scenario').order_by('-earned_at')

    @extend_schema(
        description="List user achievements",
        responses={200: ScenarioAchievementSerializer(many=True)}
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @extend_schema(
        description="Get achievement statistics",
        responses={200: OpenApiResponse(description="Achievement stats")}
    )
    @action(detail=False, methods=['get'])
    def stats(self, request):
        """
        Get achievement statistics for the user.
        """
        achievements = self.get_queryset()
        total_achievements = achievements.count()

        # Group by type
        by_type = {}
        for achievement in achievements:
            if achievement.achievement_type not in by_type:
                by_type[achievement.achievement_type] = 0
            by_type[achievement.achievement_type] += 1

        return Response({
            'total': total_achievements,
            'by_type': by_type,
            'recent': ScenarioAchievementSerializer(
                achievements[:5], many=True
            ).data
        })


# ==============================================================================
# NEW: User Certifications View
# ==============================================================================

class UserCertificationsView(APIView):
    """Get certifications for the current user based on their simulation achievements."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        certifications = []
        
        # Get user's completed simulations
        completed_sessions = SimulationSession.objects.filter(
            user=user, 
            status='completed'
        ).select_related('scenario')
        
        # Count completions by difficulty
        beginner_count = completed_sessions.filter(scenario__difficulty='beginner').count()
        intermediate_count = completed_sessions.filter(scenario__difficulty='intermediate').count()
        advanced_count = completed_sessions.filter(scenario__difficulty='advanced').count()
        
        # Calculate average score
        scores = [s.score for s in completed_sessions if s.score is not None]
        avg_score = sum(scores) // len(scores) if scores else 0
        
        # Certification 1: Aviation Security Fundamentals (Basic)
        if beginner_count >= 2:
            certifications.append({
                'id': 'avsec-101',
                'title': 'Aviation Security Fundamentals',
                'level': 'Basic',
                'category': 'Security Basics',
                'progress': 100,
                'status': 'completed',
                'score': avg_score,
                'duration': '4 weeks',
                'modules': 8,
                'completedModules': 8,
                'issuedDate': timezone.now().strftime('%Y-%m-%d'),
                'description': 'Fundamental understanding of aviation security principles, threat identification, and basic response protocols.',
                'icon': 'Shield',
                'color': '#3B82F6',
                'requirements': ['Complete 2 beginner simulations', 'Average score ≥ 70%'],
            })
        elif beginner_count > 0:
            certifications.append({
                'id': 'avsec-101',
                'title': 'Aviation Security Fundamentals',
                'level': 'Basic',
                'category': 'Security Basics',
                'progress': min(100, beginner_count * 50),
                'status': 'in-progress',
                'duration': '4 weeks',
                'modules': 8,
                'completedModules': beginner_count * 4,
                'description': 'Fundamental understanding of aviation security principles, threat identification, and basic response protocols.',
                'icon': 'Shield',
                'color': '#3B82F6',
                'requirements': ['Complete 2 beginner simulations', 'Average score ≥ 70%'],
            })
        else:
            certifications.append({
                'id': 'avsec-101',
                'title': 'Aviation Security Fundamentals',
                'level': 'Basic',
                'category': 'Security Basics',
                'progress': 0,
                'status': 'available',
                'duration': '4 weeks',
                'modules': 8,
                'completedModules': 0,
                'description': 'Fundamental understanding of aviation security principles, threat identification, and basic response protocols.',
                'icon': 'Shield',
                'color': '#3B82F6',
                'requirements': ['Complete 2 beginner simulations', 'Average score ≥ 70%'],
            })
        
        # Certification 2: Secure Communications Specialist (Intermediate)
        if intermediate_count >= 3:
            certifications.append({
                'id': 'cyber-comms',
                'title': 'Secure Communications Specialist',
                'level': 'Intermediate',
                'category': 'Communications',
                'progress': 100,
                'status': 'completed',
                'score': avg_score,
                'duration': '6 weeks',
                'modules': 12,
                'completedModules': 12,
                'issuedDate': timezone.now().strftime('%Y-%m-%d'),
                'description': 'Advanced training in secure aviation communication protocols, encryption methods, and anti-jamming techniques.',
                'icon': 'FileText',
                'color': '#8B5CF6',
                'requirements': ['Complete 3 intermediate simulations', 'Average score ≥ 75%', 'Finish 4 advanced simulations'],
            })
        elif intermediate_count > 0:
            certifications.append({
                'id': 'cyber-comms',
                'title': 'Secure Communications Specialist',
                'level': 'Intermediate',
                'category': 'Communications',
                'progress': min(100, (intermediate_count / 3) * 100),
                'status': 'in-progress',
                'duration': '6 weeks',
                'modules': 12,
                'completedModules': intermediate_count * 4,
                'description': 'Advanced training in secure aviation communication protocols, encryption methods, and anti-jamming techniques.',
                'icon': 'FileText',
                'color': '#8B5CF6',
                'requirements': ['Complete 3 intermediate simulations', 'Average score ≥ 75%', 'Finish 4 advanced simulations'],
            })
        else:
            certifications.append({
                'id': 'cyber-comms',
                'title': 'Secure Communications Specialist',
                'level': 'Intermediate',
                'category': 'Communications',
                'progress': 0,
                'status': 'locked',
                'duration': '6 weeks',
                'modules': 12,
                'completedModules': 0,
                'description': 'Advanced training in secure aviation communication protocols, encryption methods, and anti-jamming techniques.',
                'icon': 'FileText',
                'color': '#8B5CF6',
                'requirements': ['Complete Aviation Security Fundamentals', 'Complete 3 intermediate simulations', 'Average score ≥ 75%'],
            })
        
        # Certification 3: Cyber Threat Analyst (Advanced)
        if advanced_count >= 3:
            certifications.append({
                'id': 'threat-analysis',
                'title': 'Cyber Threat Analyst',
                'level': 'Advanced',
                'category': 'Threat Analysis',
                'progress': 100,
                'status': 'completed',
                'score': avg_score,
                'duration': '8 weeks',
                'modules': 16,
                'completedModules': 16,
                'issuedDate': timezone.now().strftime('%Y-%m-%d'),
                'description': 'Master threat analysis methodologies, behavioral pattern recognition, and predictive threat modeling.',
                'icon': 'TrendingUp',
                'color': '#10B981',
                'requirements': ['Complete 3 advanced simulations', 'Average score ≥ 80%', 'Lead 2 team simulations'],
            })
        elif advanced_count > 0:
            certifications.append({
                'id': 'threat-analysis',
                'title': 'Cyber Threat Analyst',
                'level': 'Advanced',
                'category': 'Threat Analysis',
                'progress': min(100, (advanced_count / 3) * 100),
                'status': 'in-progress',
                'duration': '8 weeks',
                'modules': 16,
                'completedModules': advanced_count * 5,
                'description': 'Master threat analysis methodologies, behavioral pattern recognition, and predictive threat modeling.',
                'icon': 'TrendingUp',
                'color': '#10B981',
                'requirements': ['Complete 3 advanced simulations', 'Average score ≥ 80%', 'Lead 2 team simulations'],
            })
        else:
            certifications.append({
                'id': 'threat-analysis',
                'title': 'Cyber Threat Analyst',
                'level': 'Advanced',
                'category': 'Threat Analysis',
                'progress': 0,
                'status': 'locked',
                'duration': '8 weeks',
                'modules': 16,
                'completedModules': 0,
                'description': 'Master threat analysis methodologies, behavioral pattern recognition, and predictive threat modeling.',
                'icon': 'TrendingUp',
                'color': '#10B981',
                'requirements': ['Complete Secure Communications Specialist', 'Complete 3 advanced simulations', 'Average score ≥ 80%'],
            })
        
        # Certification 4: Incident Response Commander (Expert) – locked by default
        certifications.append({
            'id': 'incident-response',
            'title': 'Incident Response Commander',
            'level': 'Expert',
            'category': 'Response',
            'progress': 0,
            'status': 'locked',
            'duration': '10 weeks',
            'modules': 20,
            'completedModules': 0,
            'description': 'Expert-level training in incident command, crisis management, and coordinated response operations.',
            'icon': 'Zap',
            'color': '#EF4444',
            'requirements': ['Complete Cyber Threat Analyst certification', 'Score ≥ 95% on leadership assessment', 'Pass 5 expert simulations'],
        })
        
        # Certification 5: Data Integrity Specialist (Intermediate) – available after basic
        if beginner_count >= 1:
            certifications.append({
                'id': 'data-integrity',
                'title': 'Data Integrity Specialist',
                'level': 'Intermediate',
                'category': 'Data Security',
                'progress': 0,
                'status': 'available',
                'duration': '5 weeks',
                'modules': 10,
                'completedModules': 0,
                'description': 'Specialized training in data protection, integrity verification, and corruption prevention.',
                'icon': 'CheckCircle',
                'color': '#F59E0B',
                'requirements': ['Complete Aviation Security Fundamentals', 'Basic understanding of data systems'],
            })
        else:
            certifications.append({
                'id': 'data-integrity',
                'title': 'Data Integrity Specialist',
                'level': 'Intermediate',
                'category': 'Data Security',
                'progress': 0,
                'status': 'locked',
                'duration': '5 weeks',
                'modules': 10,
                'completedModules': 0,
                'description': 'Specialized training in data protection, integrity verification, and corruption prevention.',
                'icon': 'CheckCircle',
                'color': '#F59E0B',
                'requirements': ['Complete Aviation Security Fundamentals', 'Basic understanding of data systems'],
            })
        
        # Certification 6: Security Team Leadership (Advanced)
        if intermediate_count >= 2:
            certifications.append({
                'id': 'team-leadership',
                'title': 'Security Team Leadership',
                'level': 'Advanced',
                'category': 'Leadership',
                'progress': 100 if advanced_count >= 2 else 50,
                'status': 'in-progress' if advanced_count < 2 else 'completed',
                'score': avg_score,
                'duration': '8 weeks',
                'modules': 14,
                'completedModules': 7 if advanced_count < 2 else 14,
                'issuedDate': timezone.now().strftime('%Y-%m-%d') if advanced_count >= 2 else None,
                'description': 'Leadership and team management skills for security operations, including delegation and crisis leadership.',
                'icon': 'Users',
                'color': '#EC4899',
                'requirements': ['2 years experience', 'Team management training', 'Complete leadership assessment'],
            })
        else:
            certifications.append({
                'id': 'team-leadership',
                'title': 'Security Team Leadership',
                'level': 'Advanced',
                'category': 'Leadership',
                'progress': 0,
                'status': 'locked',
                'duration': '8 weeks',
                'modules': 14,
                'completedModules': 0,
                'description': 'Leadership and team management skills for security operations, including delegation and crisis leadership.',
                'icon': 'Users',
                'color': '#EC4899',
                'requirements': ['Complete Secure Communications Specialist', 'Team management training'],
            })
        
        serializer = CertificationSerializer(certifications, many=True)
        return Response(serializer.data)