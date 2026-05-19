from rest_framework import status, generics, permissions, viewsets, serializers
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from django.utils import timezone
from django.db.models import Count, Avg, Q
from django.apps import apps
from django.core.files.base import ContentFile
from datetime import timedelta
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiResponse, OpenApiTypes
from .models import (
    TutorProfile, TeachingMaterial, TeachingSession,
    SessionAttendance, StudentProgress, Exercise, ExerciseAttempt,
    Report
)
from .serializers import (
    TutorProfileSerializer, TeachingMaterialSerializer, TeachingSessionSerializer,
    SessionAttendanceSerializer, StudentProgressSerializer, ExerciseSerializer,
    ExerciseAttemptSerializer, TutorDashboardStatsSerializer,
    ReportSerializer, TraineeExerciseSerializer
)
from .report_generator import generate_report
import logging
import uuid

logger = logging.getLogger(__name__)

# Lazy loaders
def get_user_model():
    return apps.get_model('users', 'User')
def get_simulation_session_model():
    return apps.get_model('simulations', 'SimulationSession')
def get_meeting_model():
    return apps.get_model('meetings', 'Meeting')


# ==============================================================================
# SERIALIZERS FOR APIVIEWS
# ==============================================================================

class SessionAttendanceResponseSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    session = serializers.UUIDField()
    student = serializers.UUIDField()
    student_name = serializers.CharField()
    student_email = serializers.EmailField()
    joined_at = serializers.DateTimeField(allow_null=True)
    left_at = serializers.DateTimeField(allow_null=True)
    duration_seconds = serializers.IntegerField()
    attendance_duration = serializers.FloatField()


class TutorDashboardResponseSerializer(serializers.Serializer):
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
# VIEWSETS AND API VIEWS
# ==============================================================================

class TutorProfileView(generics.RetrieveUpdateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = TutorProfileSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    @extend_schema(
        description="Get or update tutor profile",
        responses={
            200: TutorProfileSerializer,
            400: "Bad Request"
        }
    )
    def get(self, request, *args, **kwargs):
        return self.retrieve(request, *args, **kwargs)

    @extend_schema(
        request=TutorProfileSerializer,
        description="Update tutor profile",
        responses={
            200: TutorProfileSerializer,
            400: "Bad Request"
        }
    )
    def put(self, request, *args, **kwargs):
        return self.update(request, *args, **kwargs)

    @extend_schema(
        request=TutorProfileSerializer,
        description="Partially update tutor profile",
        responses={
            200: TutorProfileSerializer,
            400: "Bad Request"
        }
    )
    def patch(self, request, *args, **kwargs):
        return self.partial_update(request, *args, **kwargs)

    def get_object(self):
        obj, _ = TutorProfile.objects.get_or_create(user=self.request.user)
        return obj


class TeachingMaterialViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = TeachingMaterialSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return TeachingMaterial.objects.none()
        user = self.request.user
        if not user.is_authenticated:
            return TeachingMaterial.objects.none()
        return TeachingMaterial.objects.filter(tutor__user=user)

    @extend_schema(
        description="List all teaching materials",
        parameters=[
            OpenApiParameter('material_type', OpenApiTypes.STR),
            OpenApiParameter('difficulty', OpenApiTypes.STR),
            OpenApiParameter('search', OpenApiTypes.STR),
        ],
        responses={200: TeachingMaterialSerializer(many=True)}
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @extend_schema(
        description="Create new teaching material",
        request=TeachingMaterialSerializer,
        responses={
            201: TeachingMaterialSerializer,
            400: "Bad Request"
        }
    )
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        from apps.users.models import UserActivity
        UserActivity.objects.create(
            user=request.user,
            activity_type='content_view',
            metadata={
                'action': 'material_created',
                'material_id': str(serializer.instance.id),
                'material_title': serializer.instance.title
            }
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    @extend_schema(
        description="Retrieve teaching material details",
        responses={200: TeachingMaterialSerializer}
    )
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.views_count += 1
        instance.save(update_fields=['views_count'])
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    @extend_schema(
        description="Update teaching material",
        request=TeachingMaterialSerializer,
        responses={200: TeachingMaterialSerializer}
    )
    def update(self, request, *args, **kwargs):
        return super().update(request, *args, **kwargs)

    @extend_schema(
        description="Partially update teaching material",
        request=TeachingMaterialSerializer,
        responses={200: TeachingMaterialSerializer}
    )
    def partial_update(self, request, *args, **kwargs):
        return super().partial_update(request, *args, **kwargs)

    @extend_schema(
        description="Delete teaching material",
        responses={204: "No Content"}
    )
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)

    @extend_schema(
        description="Publish teaching material",
        responses={200: OpenApiResponse(description="Material published successfully")}
    )
    @action(detail=True, methods=['post'])
    def publish(self, request, pk=None):
        material = self.get_object()
        material.is_published = True
        material.save()
        return Response({'message': 'Material published successfully'})

    @extend_schema(
        description="Unpublish teaching material",
        responses={200: OpenApiResponse(description="Material unpublished successfully")}
    )
    @action(detail=True, methods=['post'])
    def unpublish(self, request, pk=None):
        material = self.get_object()
        material.is_published = False
        material.save()
        return Response({'message': 'Material unpublished successfully'})

    def perform_create(self, serializer):
        tutor = TutorProfile.objects.get(user=self.request.user)
        serializer.save(tutor=tutor)


class TeachingSessionViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = TeachingSessionSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return TeachingSession.objects.none()
        user = self.request.user
        if not user.is_authenticated:
            return TeachingSession.objects.none()

        queryset = TeachingSession.objects.filter(
            tutor__user=user
        ).select_related('tutor', 'tutor__user', 'internal_meeting').order_by('start_time')

        params = self.request.query_params
        now = timezone.now()

        status_param = params.get('status')
        if status_param == 'upcoming':
            queryset = queryset.filter(is_cancelled=False, start_time__gt=now)
        elif status_param == 'live':
            queryset = queryset.filter(is_cancelled=False, start_time__lte=now, end_time__gte=now)
        elif status_param == 'ended':
            queryset = queryset.filter(is_cancelled=False, end_time__lt=now)
        elif status_param == 'cancelled':
            queryset = queryset.filter(is_cancelled=True)

        session_type = params.get('session_type')
        if session_type:
            queryset = queryset.filter(session_type=session_type)

        from_date = params.get('from_date')
        if from_date:
            queryset = queryset.filter(start_time__date__gte=from_date)

        to_date = params.get('to_date')
        if to_date:
            queryset = queryset.filter(start_time__date__lte=to_date)

        return queryset

    @extend_schema(
        description="List all teaching sessions",
        parameters=[
            OpenApiParameter('status', OpenApiTypes.STR, enum=['upcoming', 'live', 'ended', 'cancelled']),
            OpenApiParameter('session_type', OpenApiTypes.STR),
            OpenApiParameter('from_date', OpenApiTypes.STR),
            OpenApiParameter('to_date', OpenApiTypes.STR),
        ],
        responses={200: TeachingSessionSerializer(many=True)}
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @extend_schema(
        description="Create new teaching session",
        request=TeachingSessionSerializer,
        responses={201: TeachingSessionSerializer, 400: "Bad Request"}
    )
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        if serializer.instance.platform == 'internal':
            meeting = serializer.instance.create_internal_meeting()
            logger.info(f"Internal meeting created for session {serializer.instance.id}: {meeting.meeting_code}")
        headers = self.get_success_headers(serializer.data)
        from apps.users.models import UserActivity
        UserActivity.objects.create(
            user=request.user,
            activity_type='meeting_created',
            metadata={
                'session_id': str(serializer.instance.id),
                'session_title': serializer.instance.title,
                'platform': serializer.instance.platform
            }
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    @extend_schema(
        description="Retrieve teaching session details",
        responses={200: TeachingSessionSerializer}
    )
    def retrieve(self, request, *args, **kwargs):
        return super().retrieve(request, *args, **kwargs)

    @extend_schema(
        description="Update teaching session",
        request=TeachingSessionSerializer,
        responses={200: TeachingSessionSerializer}
    )
    def update(self, request, *args, **kwargs):
        return super().update(request, *args, **kwargs)

    @extend_schema(
        description="Partially update teaching session",
        request=TeachingSessionSerializer,
        responses={200: TeachingSessionSerializer}
    )
    def partial_update(self, request, *args, **kwargs):
        return super().partial_update(request, *args, **kwargs)

    @extend_schema(
        description="Delete teaching session",
        responses={204: "No Content"}
    )
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)

    @extend_schema(
        description="Cancel teaching session",
        responses={200: OpenApiResponse(description="Session cancelled")}
    )
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        session = self.get_object()
        session.is_cancelled = True
        session.cancellation_reason = request.data.get('reason', '')
        session.save()
        if session.internal_meeting:
            session.internal_meeting.status = 'cancelled'
            session.internal_meeting.save()
        return Response({'message': 'Session cancelled'})

    @extend_schema(
        description="Add recording URL to session",
        responses={200: OpenApiResponse(description="Recording added")}
    )
    @action(detail=True, methods=['post'])
    def add_recording(self, request, pk=None):
        session = self.get_object()
        session.recording_url = request.data.get('recording_url')
        session.recording_available = True
        session.save()
        return Response({'message': 'Recording added'})

    @extend_schema(
        description="Create internal meeting for session",
        responses={200: OpenApiResponse(description="Internal meeting created")}
    )
    @action(detail=True, methods=['post'])
    def create_meeting(self, request, pk=None):
        session = self.get_object()
        if session.internal_meeting:
            return Response({'message': 'Meeting already exists', 'meeting_code': session.internal_meeting.meeting_code})
        meeting = session.create_internal_meeting()
        return Response({'message': 'Internal meeting created', 'meeting_code': meeting.meeting_code, 'meeting_link': session.meeting_link})

    def perform_create(self, serializer):
        tutor = TutorProfile.objects.get(user=self.request.user)
        serializer.save(tutor=tutor)


class SessionAttendanceView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    @extend_schema(
        request={
            'application/json': {
                'type': 'object',
                'required': ['student_id', 'action'],
                'properties': {
                    'student_id': {'type': 'string', 'format': 'uuid'},
                    'action': {'type': 'string', 'enum': ['join', 'leave']}
                }
            }
        },
        responses={200: SessionAttendanceResponseSerializer(), 404: OpenApiResponse(description="Session or Student not found")}
    )
    def post(self, request, session_id):
        try:
            session = TeachingSession.objects.get(id=session_id, tutor__user=request.user)
        except TeachingSession.DoesNotExist:
            return Response({'error': 'Session not found'}, status=status.HTTP_404_NOT_FOUND)
        student_id = request.data.get('student_id')
        User = get_user_model()
        try:
            student = User.objects.get(id=student_id)
        except User.DoesNotExist:
            return Response({'error': 'Student not found'}, status=status.HTTP_404_NOT_FOUND)
        attendance, created = SessionAttendance.objects.get_or_create(session=session, student=student)
        action = request.data.get('action')
        if action == 'join':
            attendance.joined_at = timezone.now()
            attendance.left_at = None
            session.current_attendees += 1
            session.save()
        elif action == 'leave':
            attendance.left_at = timezone.now()
            if attendance.joined_at:
                duration = attendance.left_at - attendance.joined_at
                attendance.duration_seconds = int(duration.total_seconds())
            if session.current_attendees > 0:
                session.current_attendees -= 1
                session.save()
        attendance.save()
        serializer = SessionAttendanceSerializer(attendance)
        return Response(serializer.data)


class StudentProgressViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = StudentProgressSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return StudentProgress.objects.none()
        user = self.request.user
        if not user.is_authenticated:
            return StudentProgress.objects.none()
        return StudentProgress.objects.filter(tutor__user=user).select_related('student')

    @extend_schema(
        description="List all students under this tutor",
        parameters=[
            OpenApiParameter('search', OpenApiTypes.STR),
            OpenApiParameter('sort_by', OpenApiTypes.STR, enum=['name', 'score', 'last_active']),
        ],
        responses={200: StudentProgressSerializer(many=True)}
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @extend_schema(
        description="Add notes to student progress",
        responses={200: StudentProgressSerializer}
    )
    @action(detail=True, methods=['post'], url_path='notes')
    def add_notes(self, request, pk=None):
        progress = self.get_object()
        progress.tutor_notes = request.data.get('notes', '')
        progress.save()
        serializer = self.get_serializer(progress)
        return Response(serializer.data)

    @extend_schema(
        description="Track meeting attendance for student",
        responses={200: OpenApiResponse(description="Meeting attendance tracked")}
    )
    @action(detail=True, methods=['post'], url_path='track-meeting')
    def track_meeting(self, request, pk=None):
        progress = self.get_object()
        meeting_id = request.data.get('meeting_id')
        if not meeting_id:
            return Response({'error': 'Meeting ID required'}, status=status.HTTP_400_BAD_REQUEST)
        if progress.attended_meetings is None:
            progress.attended_meetings = []
        if meeting_id not in progress.attended_meetings:
            progress.attended_meetings.append(meeting_id)
            progress.save()
        return Response({'message': 'Meeting attendance tracked'})

    @extend_schema(
        description="Get detailed progress for a specific student",
        responses={200: StudentProgressSerializer}
    )
    def retrieve(self, request, *args, **kwargs):
        return super().retrieve(request, *args, **kwargs)


class StudentProgressView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = StudentProgressSerializer
    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return StudentProgress.objects.none()
        return StudentProgress.objects.filter(tutor__user=self.request.user).select_related('student')


class ExerciseViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ExerciseSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Exercise.objects.none()
        user = self.request.user
        if not user.is_authenticated:
            return Exercise.objects.none()
        return Exercise.objects.filter(tutor__user=user)

    @extend_schema(
        description="List all exercises",
        parameters=[
            OpenApiParameter('exercise_type', OpenApiTypes.STR),
            OpenApiParameter('search', OpenApiTypes.STR),
        ],
        responses={200: ExerciseSerializer(many=True)}
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @extend_schema(
        description="Create new exercise",
        request=ExerciseSerializer,
        responses={201: ExerciseSerializer, 400: "Bad Request"}
    )
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    @extend_schema(
        description="Retrieve exercise details",
        responses={200: ExerciseSerializer}
    )
    def retrieve(self, request, *args, **kwargs):
        return super().retrieve(request, *args, **kwargs)

    @extend_schema(
        description="Update exercise",
        request=ExerciseSerializer,
        responses={200: ExerciseSerializer}
    )
    def update(self, request, *args, **kwargs):
        return super().update(request, *args, **kwargs)

    @extend_schema(
        description="Partially update exercise",
        request=ExerciseSerializer,
        responses={200: ExerciseSerializer}
    )
    def partial_update(self, request, *args, **kwargs):
        return super().partial_update(request, *args, **kwargs)

    @extend_schema(
        description="Delete exercise",
        responses={204: "No Content"}
    )
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['get'], url_path='with-attempts')
    def with_attempts(self, request):
        """Return exercises that have at least one attempt, annotated with attempt count."""
        queryset = self.get_queryset().filter(is_published=True)
        exercises = queryset.annotate(attempts_count=Count('attempts')).filter(attempts_count__gt=0)
        serializer = self.get_serializer(exercises, many=True)
        # Add attempts_count to each item manually
        data = []
        for ex, ser in zip(exercises, serializer.data):
            ser['attempts_count'] = ex.attempts_count
            data.append(ser)
        return Response(data)

    def perform_create(self, serializer):
        tutor = TutorProfile.objects.get(user=self.request.user)
        serializer.save(tutor=tutor)


class ExerciseAttemptView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ExerciseAttemptSerializer
    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return ExerciseAttempt.objects.none()
        exercise_id = self.kwargs.get('exercise_id')
        queryset = ExerciseAttempt.objects.filter(exercise_id=exercise_id, exercise__tutor__user=self.request.user)
        student_id = self.request.query_params.get('student_id')
        if student_id:
            queryset = queryset.filter(student_id=student_id)
        passed = self.request.query_params.get('passed')
        if passed is not None:
            queryset = queryset.filter(passed=passed.lower() == 'true')
        return queryset.select_related('student', 'exercise').order_by('-started_at')

    @extend_schema(
        description="List all attempts for an exercise",
        parameters=[
            OpenApiParameter('student_id', OpenApiTypes.STR),
            OpenApiParameter('passed', OpenApiTypes.BOOL),
        ],
        responses={200: ExerciseAttemptSerializer(many=True)}
    )
    def get(self, request, *args, **kwargs):
        return self.list(request, *args, **kwargs)


class ExerciseAttemptDetailView(generics.RetrieveUpdateAPIView):
    """View for tutors to retrieve and update a specific exercise attempt (e.g., to grade)."""
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ExerciseAttemptSerializer
    queryset = ExerciseAttempt.objects.all()
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        user = self.request.user
        # Only allow access to attempts belonging to exercises owned by this tutor
        return ExerciseAttempt.objects.filter(exercise__tutor__user=user)

    @extend_schema(
        description="Update an exercise attempt (e.g., manual grade adjustment)",
        request=ExerciseAttemptSerializer,
        responses={200: ExerciseAttemptSerializer, 400: "Bad Request", 403: "Forbidden"}
    )
    def update(self, request, *args, **kwargs):
        return super().update(request, *args, **kwargs)

    @extend_schema(
        description="Partially update an exercise attempt",
        request=ExerciseAttemptSerializer,
        responses={200: ExerciseAttemptSerializer, 400: "Bad Request", 403: "Forbidden"}
    )
    def partial_update(self, request, *args, **kwargs):
        return super().partial_update(request, *args, **kwargs)


class TutorDashboardView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    @extend_schema(
        responses={200: TutorDashboardResponseSerializer()}
    )
    def get(self, request):
        tutor = TutorProfile.objects.get(user=request.user)
        SimulationSession = get_simulation_session_model()
        Meeting = get_meeting_model()
        total_students = StudentProgress.objects.filter(tutor=tutor).count()
        total_materials = TeachingMaterial.objects.filter(tutor=tutor).count()
        total_exercises = Exercise.objects.filter(tutor=tutor).count()
        total_meetings = Meeting.objects.filter(host=request.user).count() if Meeting else 0
        upcoming_sessions = TeachingSession.objects.filter(tutor=tutor, start_time__gte=timezone.now(), is_cancelled=False).order_by('start_time')[:5]
        upcoming_meetings = []
        if Meeting:
            upcoming_meetings = Meeting.objects.filter(host=request.user, scheduled_start__gte=timezone.now(), status__in=['scheduled']).order_by('scheduled_start')[:5]
        recent_uploads = TeachingMaterial.objects.filter(tutor=tutor).order_by('-created_at')[:5]
        student_progress = list(
            StudentProgress.objects.filter(tutor=tutor).select_related('student')[:10]
        )
        score_by_user = {}
        if SimulationSession and student_progress:
            student_ids = [p.student_id for p in student_progress]
            score_by_user = {
                row['user_id']: row['avg_score'] or 0
                for row in SimulationSession.objects.filter(
                    user_id__in=student_ids, status='completed'
                )
                .values('user_id')
                .annotate(avg_score=Avg('score'))
            }
        student_performance = []
        for progress in student_progress:
            avg_score = score_by_user.get(progress.student_id, 0)
            student_performance.append({
                'student_id': str(progress.student.id),
                'student_name': progress.student.get_full_name(),
                'student_email': progress.student.email,
                'completed_materials': len(progress.completed_materials) if progress.completed_materials else 0,
                'completed_exercises': len(progress.completed_exercises) if progress.completed_exercises else 0,
                'meetings_attended': len(progress.attended_meetings) if progress.attended_meetings else 0,
                'average_score': round(avg_score, 2),
                'last_activity': progress.last_activity,
                'strengths': progress.strengths if progress.strengths else [],
                'areas_for_improvement': progress.areas_for_improvement if progress.areas_for_improvement else []
            })
        data = {
            'total_students': total_students,
            'total_materials': total_materials,
            'total_exercises': total_exercises,
            'total_meetings': total_meetings,
            'upcoming_sessions': upcoming_sessions.count(),
            'upcoming_meetings': len(upcoming_meetings),
            'recent_uploads': TeachingMaterialSerializer(recent_uploads, many=True, context={'request': request}).data,
            'upcoming_sessions_list': TeachingSessionSerializer(upcoming_sessions, many=True, context={'request': request}).data,
            'upcoming_meetings_list': [{'id': str(m.id), 'title': m.title, 'code': m.meeting_code} for m in upcoming_meetings],
            'student_performance': student_performance
        }
        serializer = TutorDashboardStatsSerializer(data=data)
        serializer.is_valid()
        return Response(serializer.data)


# ==============================================================================
# REPORT VIEWSET
# ==============================================================================

class ReportViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ReportSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Report.objects.none()
        user = self.request.user
        if not user.is_authenticated:
            return Report.objects.none()
        tutor = TutorProfile.objects.filter(user=user).first()
        if not tutor:
            return Report.objects.none()
        return Report.objects.filter(tutor=tutor)

    def perform_create(self, serializer):
        tutor = TutorProfile.objects.get(user=self.request.user)
        serializer.save(tutor=tutor, status='draft')

    @extend_schema(
        description="Generate a new report (creates a PDF file)",
        responses={201: ReportSerializer, 400: "Bad Request", 500: "Internal Server Error"}
    )
    @action(detail=False, methods=['post'], url_path='generate')
    def generate(self, request):
        title = request.data.get('title')
        report_type = request.data.get('type')
        date_range = request.data.get('date_range', {})
        if not title or not report_type:
            return Response({'error': 'Title and type are required'}, status=status.HTTP_400_BAD_REQUEST)
        tutor = TutorProfile.objects.get(user=request.user)
        report = Report.objects.create(
            tutor=tutor,
            title=title,
            type=report_type,
            status='generating',
            metadata={'date_range': date_range}
        )
        try:
            pdf_buffer = generate_report(tutor, report_type, date_range, request)
            filename = f"{title.replace(' ', '_')}_{timezone.now().strftime('%Y%m%d_%H%M%S')}.pdf"
            report.file.save(filename, ContentFile(pdf_buffer.getvalue()), save=False)
            report.file_size = pdf_buffer.getbuffer().nbytes
            report.status = 'published'
            report.save()
            serializer = self.get_serializer(report)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception as e:
            logger.error(f"Report generation failed: {str(e)}")
            report.status = 'draft'
            report.save()
            return Response({'error': f'Failed to generate report: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @extend_schema(
        description="Download report file",
        responses={200: OpenApiResponse(description='application/octet-stream'), 404: OpenApiResponse(description='Report not found or file missing')}
    )
    @action(detail=True, methods=['get'], url_path='download')
    def download(self, request, pk=None):
        report = self.get_object()
        if not report.file:
            return Response({'error': 'Report file not available'}, status=status.HTTP_404_NOT_FOUND)
        response = Response(report.file, content_type='application/octet-stream')
        response['Content-Disposition'] = f'attachment; filename="{report.title}.pdf"'
        return response


# ==============================================================================
# TRAINEE EXERCISE ENDPOINTS
# ==============================================================================

class TraineeExerciseViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for trainees to see assigned exercises."""
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = TraineeExerciseSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Exercise.objects.none()
        user = self.request.user
        if not user.is_authenticated or user.role != 'trainee':
            return Exercise.objects.none()

        # Find tutors that have this trainee in their StudentProgress
        student_progress = StudentProgress.objects.filter(student=user).select_related('tutor')
        tutor_ids = [sp.tutor_id for sp in student_progress]

        # Return published exercises from those tutors
        return Exercise.objects.filter(
            tutor_id__in=tutor_ids,
            is_published=True
        ).order_by('-created_at')

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['user'] = self.request.user
        return context


class TraineeExerciseStatusView(APIView):
    """Check if trainee has any assigned exercises."""
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(
        responses={200: OpenApiResponse(
            description="Exercise status"
        )}
    )
    def get(self, request):
        user = request.user
        if user.role != 'trainee':
            return Response({'has_exercises': False})

        student_progress = StudentProgress.objects.filter(student=user)
        tutor_ids = [sp.tutor_id for sp in student_progress]

        has_exercises = Exercise.objects.filter(
            tutor_id__in=tutor_ids,
            is_published=True
        ).exists()

        return Response({'has_exercises': has_exercises})


class TraineeExerciseSubmitView(APIView):
    """Submit exercise answers."""
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    @extend_schema(
        responses={200: OpenApiResponse(
            description="Submission result"
        )}
    )
    def post(self, request):
        user = request.user
        exercise_id = request.data.get('exercise_id')
        answers = request.data.get('answers', {})

        if not exercise_id:
            return Response({'error': 'exercise_id required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            exercise = Exercise.objects.get(id=exercise_id, is_published=True)
        except Exercise.DoesNotExist:
            return Response({'error': 'Exercise not found'}, status=status.HTTP_404_NOT_FOUND)

        # Check if user is allowed to take this exercise (tutor must have StudentProgress for this user)
        if not StudentProgress.objects.filter(student=user, tutor=exercise.tutor).exists():
            return Response({'error': 'Not authorized for this exercise'}, status=status.HTTP_403_FORBIDDEN)

        # Count existing attempts
        attempts_count = ExerciseAttempt.objects.filter(exercise=exercise, student=user).count()
        if attempts_count >= exercise.max_attempts:
            return Response({'error': 'Maximum attempts reached'}, status=status.HTTP_400_BAD_REQUEST)

        # Score calculation
        score = self.calculate_score(exercise, answers)
        passed = score >= exercise.passing_score

        # Record attempt
        attempt = ExerciseAttempt.objects.create(
            exercise=exercise,
            student=user,
            score=score,
            answers=answers,
            time_taken=0,
            passed=passed,
            attempt_number=attempts_count + 1,
            feedback=''
        )

        # Update StudentProgress
        student_progress, _ = StudentProgress.objects.get_or_create(
            tutor=exercise.tutor,
            student=user
        )
        if student_progress.completed_exercises is None:
            student_progress.completed_exercises = []
        if str(exercise.id) not in student_progress.completed_exercises and passed:
            student_progress.completed_exercises.append(str(exercise.id))
            student_progress.save()

        return Response({
            'score': score,
            'passed': passed,
            'feedback': f'You scored {score}%. ' + ('Well done!' if passed else 'Keep practicing.')
        })

    def calculate_score(self, exercise, answers):
        """
        Simple scoring: compare answers with stored correct answers.
        Assumes answers is a dict mapping question indices to chosen option IDs.
        """
        if not exercise.answers:
            return 0
        correct_answers = exercise.answers
        total = len(correct_answers)
        if total == 0:
            return 0
        correct_count = 0
        for idx, correct in enumerate(correct_answers):
            user_answer = answers.get(str(idx)) or answers.get(idx)
            if user_answer == correct:
                correct_count += 1
        return round((correct_count / total) * 100, 2)