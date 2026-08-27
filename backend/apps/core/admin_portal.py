"""
Admin portal REST APIs for the SkyShield frontend.
All endpoints require role=admin (or Django staff/superuser).
"""

from datetime import datetime, time, timedelta

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, Q
from django.db.models.functions import TruncDate, TruncMonth
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, serializers
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.models import APILog, AuditLog, ErrorLog
from apps.core.serializers import APILogSerializer, AuditLogSerializer, ErrorLogSerializer
from apps.meetings.models import Meeting
from apps.meetings.serializers import MeetingListSerializer
from apps.simulations.models import Course, CourseCertificate, CourseEnrollment, SimulationSession
from apps.tutor.models import TeachingSession, TutorProfile
from apps.tutor.serializers import TeachingSessionSerializer

User = get_user_model()

DIFFICULTY_LABELS = {1: 'Beginner', 2: 'Intermediate', 3: 'Advanced', 4: 'Expert'}


class IsAppAdmin(permissions.BasePermission):
    """Platform admin: app role admin, or Django staff/superuser."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return (
            getattr(user, 'role', None) == 'admin'
            or user.is_staff
            or user.is_superuser
        )


class AdminPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 200


class AdminUserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'email', 'username', 'first_name', 'last_name', 'full_name',
            'role', 'status', 'is_active', 'department', 'organization',
            'job_title', 'training_level', 'email_verified',
            'simulations_completed', 'total_score', 'accuracy_rate',
            'created_at', 'updated_at', 'last_active', 'last_login',
        ]
        read_only_fields = [
            'id', 'email', 'username', 'first_name', 'last_name', 'full_name',
            'role', 'department', 'organization', 'job_title', 'training_level',
            'email_verified', 'simulations_completed', 'total_score', 'accuracy_rate',
            'created_at', 'updated_at', 'last_active', 'last_login',
        ]

    def get_full_name(self, obj):
        return obj.get_full_name()


class AdminUserStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=[c[0] for c in User.STATUS_CHOICES])
    is_active = serializers.BooleanField(required=False)


class AdminUserStatusUpdateView(APIView):
    """PATCH /api/core/admin/users/<uuid>/status/ — suspend, activate, etc."""

    permission_classes = [permissions.IsAuthenticated, IsAppAdmin]

    def patch(self, request, pk):
        user = get_object_or_404(User, pk=pk, deleted_at__isnull=True)
        body = AdminUserStatusUpdateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        update_fields = ['status', 'updated_at']

        user.status = data['status']
        if data['status'] == 'suspended':
            user.is_active = False
            update_fields.append('is_active')
        elif data['status'] == 'active':
            user.is_active = True
            update_fields.append('is_active')
        elif data['status'] in ('inactive', 'pending'):
            if 'is_active' in data:
                user.is_active = data['is_active']
                update_fields.append('is_active')
            elif data['status'] == 'inactive':
                user.is_active = False
                update_fields.append('is_active')
        elif 'is_active' in data:
            user.is_active = data['is_active']
            update_fields.append('is_active')

        user.save(update_fields=list(dict.fromkeys(update_fields)))
        return Response(AdminUserSerializer(user).data)


class AdminTutorProfileSerializer(serializers.ModelSerializer):
    user_id = serializers.UUIDField(source='user.id', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    full_name = serializers.SerializerMethodField()
    role = serializers.CharField(source='user.role', read_only=True)
    status = serializers.CharField(source='user.status', read_only=True)
    department = serializers.CharField(source='user.department', read_only=True)

    class Meta:
        model = TutorProfile
        fields = [
            'user_id', 'email', 'full_name', 'role', 'status', 'department',
            'specialization', 'experience_years', 'total_students', 'total_sessions',
            'total_meetings', 'average_rating', 'created_at', 'updated_at',
        ]

    def get_full_name(self, obj):
        return obj.user.get_full_name()


class AdminCourseSerializer(serializers.ModelSerializer):
    created_by_email = serializers.EmailField(source='created_by.email', read_only=True)
    module_count = serializers.IntegerField(read_only=True)
    enrollment_count = serializers.IntegerField(read_only=True)
    difficulty_label = serializers.SerializerMethodField()

    class Meta:
        model = Course
        fields = [
            'id', 'title', 'description', 'threat_focus', 'difficulty',
            'difficulty_label', 'is_published', 'estimated_hours', 'passing_threshold',
            'created_by_email', 'module_count', 'enrollment_count',
            'created_at', 'updated_at',
        ]

    def get_difficulty_label(self, obj):
        return DIFFICULTY_LABELS.get(obj.difficulty, 'Unknown')


class AdminUserListMixin:
    permission_classes = [permissions.IsAuthenticated, IsAppAdmin]
    serializer_class = AdminUserSerializer
    pagination_class = AdminPagination
    role_filter = None

    def get_queryset(self):
        qs = User.objects.filter(deleted_at__isnull=True).order_by('-created_at')
        if self.role_filter:
            qs = qs.filter(role=self.role_filter)

        status = self.request.query_params.get('status')
        if status:
            qs = qs.filter(status=status)

        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() in ('1', 'true', 'yes'))

        department = self.request.query_params.get('department')
        if department:
            qs = qs.filter(department__icontains=department)

        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(email__icontains=search)
                | Q(username__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
            )
        return qs


class AdminAllUsersView(AdminUserListMixin, generics.ListAPIView):
    """GET /api/core/admin/users/"""


class AdminSupervisorsView(AdminUserListMixin, generics.ListAPIView):
    """GET /api/core/admin/supervisors/"""
    role_filter = 'supervisor'


class AdminInstructorsView(AdminUserListMixin, generics.ListAPIView):
    """GET /api/core/admin/instructors/"""
    role_filter = 'instructor'


class AdminAdminsView(AdminUserListMixin, generics.ListAPIView):
    """GET /api/core/admin/admins/"""
    role_filter = 'admin'


class AdminTutorsView(generics.ListAPIView):
    """GET /api/core/admin/tutors/ — users with a TutorProfile."""
    permission_classes = [permissions.IsAuthenticated, IsAppAdmin]
    serializer_class = AdminTutorProfileSerializer
    pagination_class = AdminPagination

    def get_queryset(self):
        qs = TutorProfile.objects.select_related('user').order_by('-created_at')
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(user__email__icontains=search)
                | Q(user__first_name__icontains=search)
                | Q(user__last_name__icontains=search)
            )
        role = self.request.query_params.get('role')
        if role:
            qs = qs.filter(user__role=role)
        return qs


class AdminAllCoursesView(generics.ListAPIView):
    """GET /api/core/admin/courses/"""
    permission_classes = [permissions.IsAuthenticated, IsAppAdmin]
    serializer_class = AdminCourseSerializer
    pagination_class = AdminPagination

    def get_queryset(self):
        qs = Course.objects.select_related('created_by').annotate(
            module_count=Count('modules', distinct=True),
            enrollment_count=Count('enrollments', distinct=True),
        ).order_by('-created_at')

        published = self.request.query_params.get('is_published')
        if published is not None:
            qs = qs.filter(is_published=published.lower() in ('1', 'true', 'yes'))

        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(Q(title__icontains=search) | Q(description__icontains=search))
        return qs


def _schedule_session_queryset(request):
    now = timezone.now()
    qs = TeachingSession.objects.select_related(
        'tutor__user', 'internal_meeting',
    ).order_by('-start_time')
    from_date = request.query_params.get('from')
    to_date = request.query_params.get('to')
    if from_date:
        qs = qs.filter(start_time__gte=from_date)
    if to_date:
        qs = qs.filter(end_time__lte=to_date)
    if request.query_params.get('upcoming', '').lower() in ('1', 'true', 'yes'):
        qs = qs.filter(end_time__gte=now, is_cancelled=False)
    return qs


def _schedule_meeting_queryset(request):
    now = timezone.now()
    qs = Meeting.objects.select_related('host').order_by('-scheduled_start')
    from_date = request.query_params.get('from')
    to_date = request.query_params.get('to')
    if from_date:
        qs = qs.filter(scheduled_start__gte=from_date)
    if to_date:
        qs = qs.filter(scheduled_end__lte=to_date)
    if request.query_params.get('upcoming', '').lower() in ('1', 'true', 'yes'):
        qs = qs.filter(
            scheduled_end__gte=now,
            status__in=['scheduled', 'live'],
        )
    return qs


class AdminScheduleSessionsView(generics.ListAPIView):
    """GET /api/core/admin/schedule/sessions/ — paginated teaching sessions."""

    permission_classes = [permissions.IsAuthenticated, IsAppAdmin]
    serializer_class = TeachingSessionSerializer
    pagination_class = AdminPagination

    def get_queryset(self):
        return _schedule_session_queryset(self.request)

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['request'] = self.request
        return ctx


class AdminScheduleMeetingsView(generics.ListAPIView):
    """GET /api/core/admin/schedule/meetings/ — paginated meetings."""

    permission_classes = [permissions.IsAuthenticated, IsAppAdmin]
    serializer_class = MeetingListSerializer
    pagination_class = AdminPagination

    def get_queryset(self):
        return _schedule_meeting_queryset(self.request)

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['request'] = self.request
        return ctx


class AdminAuditLogsView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated, IsAppAdmin]
    serializer_class = AuditLogSerializer
    pagination_class = AdminPagination
    queryset = AuditLog.objects.select_related('user').order_by('-timestamp')


class AdminErrorLogsView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated, IsAppAdmin]
    serializer_class = ErrorLogSerializer
    pagination_class = AdminPagination
    queryset = ErrorLog.objects.select_related('user').order_by('-created_at')


class AdminApiLogsView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated, IsAppAdmin]
    serializer_class = APILogSerializer
    pagination_class = AdminPagination
    queryset = APILog.objects.select_related('user').order_by('-timestamp')


MAX_METRICS_RANGE_DAYS = 365


def _aware_day_start(d):
    return timezone.make_aware(datetime.combine(d, time.min))


def _filter_in_window(qs, field, start_dt, end_dt=None):
    qs = qs.filter(**{f'{field}__gte': start_dt})
    if end_dt is not None:
        qs = qs.filter(**{f'{field}__lt': end_dt})
    return qs


def _parse_metrics_window(request):
    """
    Resolve the metrics time window from query params.

    Preset: ?days=7|30|90 (default 30) — rolling window ending now.
    Custom: ?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD — inclusive calendar
    dates in the project timezone (UTC).
    """
    start_raw = request.query_params.get('start_date')
    end_raw = request.query_params.get('end_date')
    try:
        months = max(3, min(24, int(request.query_params.get('months', 12))))
    except (TypeError, ValueError):
        months = 12

    if start_raw is not None or end_raw is not None:
        if not start_raw or not end_raw:
            return None, Response(
                {'error': 'start_date and end_date are required together'},
                status=400,
            )
        try:
            start = parse_date(str(start_raw).strip())
            end = parse_date(str(end_raw).strip())
        except (TypeError, ValueError):
            start = None
            end = None
        if start is None or end is None:
            return None, Response(
                {'error': 'Invalid date format. Use YYYY-MM-DD.'},
                status=400,
            )
        if start > end:
            return None, Response(
                {'error': 'start_date must be on or before end_date'},
                status=400,
            )
        span_days = (end - start).days + 1
        if span_days > MAX_METRICS_RANGE_DAYS:
            return None, Response(
                {'error': f'Date range cannot exceed {MAX_METRICS_RANGE_DAYS} days'},
                status=400,
            )
        range_start = _aware_day_start(start)
        range_end = _aware_day_start(end + timedelta(days=1))
        return {
            'days': span_days,
            'months': months,
            'since_days': range_start,
            'until_days': range_end,
            'since_months': range_start,
            'until_months': range_end,
            'start_date': start,
            'end_date': end,
            'custom': True,
        }, None

    try:
        days = max(7, min(MAX_METRICS_RANGE_DAYS, int(request.query_params.get('days', 30))))
    except (TypeError, ValueError):
        days = 30
    now = timezone.now()
    return {
        'days': days,
        'months': months,
        'since_days': now - timedelta(days=days),
        'until_days': None,
        'since_months': now - timedelta(days=months * 31),
        'until_months': None,
        'start_date': None,
        'end_date': None,
        'custom': False,
    }, None


class AdminChartMetricsView(APIView):
    """
    GET /api/core/admin/metrics/charts/
    Chart-ready datasets for the admin frontend dashboard.
    Query: days (default 30), months (default 12),
    or start_date & end_date (YYYY-MM-DD, inclusive).
    """
    permission_classes = [permissions.IsAuthenticated, IsAppAdmin]

    def get(self, request):
        window, error = _parse_metrics_window(request)
        if error is not None:
            return error

        days = window['days']
        months = window['months']
        since_days = window['since_days']
        until_days = window['until_days']
        since_months = window['since_months']
        until_months = window['until_months']

        now = timezone.now()

        users = User.objects.filter(deleted_at__isnull=True)

        user_growth = list(
            _filter_in_window(users, 'created_at', since_days, until_days)
            .annotate(day=TruncDate('created_at'))
            .values('day')
            .annotate(count=Count('id'))
            .order_by('day')
        )

        users_by_role = list(
            users.values('role').annotate(count=Count('id')).order_by('role')
        )

        users_by_status = list(
            users.values('status').annotate(count=Count('id')).order_by('status')
        )

        by_department = list(
            users.exclude(department='')
            .values('department')
            .annotate(count=Count('id'))
            .order_by('-count')[:15]
        )

        login_activity = []
        try:
            from apps.users.models import UserActivity
            login_activity = list(
                _filter_in_window(
                    UserActivity.objects.filter(activity_type='login'),
                    'timestamp',
                    since_days,
                    until_days,
                )
                .annotate(day=TruncDate('timestamp'))
                .values('day')
                .annotate(count=Count('id'))
                .order_by('day')
            )
        except Exception:
            pass

        sessions = SimulationSession.objects.all()
        simulations_by_status = list(
            sessions.values('status').annotate(count=Count('id')).order_by('status')
        )

        simulation_scores_trend = list(
            _filter_in_window(
                sessions.filter(status='completed'),
                'completed_at',
                since_months,
                until_months,
            )
            .annotate(month=TruncMonth('completed_at'))
            .values('month')
            .annotate(
                avg_score=Avg('score'),
                completions=Count('id'),
                learners=Count('user', distinct=True),
            )
            .order_by('month')
        )

        enrollments_trend = list(
            _filter_in_window(
                CourseEnrollment.objects.all(),
                'enrolled_at',
                since_months,
                until_months,
            )
            .annotate(month=TruncMonth('enrolled_at'))
            .values('month')
            .annotate(count=Count('id'))
            .order_by('month')
        )

        courses_by_publish = list(
            Course.objects.values('is_published').annotate(count=Count('id'))
        )

        certs = CourseCertificate.objects.all()
        certificates_by_level = list(
            certs.values('enrollment__course__difficulty')
            .annotate(count=Count('id'))
            .order_by('enrollment__course__difficulty')
        )

        certificate_trend = list(
            _filter_in_window(certs, 'issued_at', since_months, until_months)
            .annotate(month=TruncMonth('issued_at'))
            .values('month')
            .annotate(count=Count('id'))
            .order_by('month')
        )

        errors_by_day = list(
            _filter_in_window(ErrorLog.objects.all(), 'created_at', since_days, until_days)
            .annotate(day=TruncDate('created_at'))
            .values('day')
            .annotate(count=Count('id'))
            .order_by('day')
        )

        schedule_upcoming = {
            'teaching_sessions': TeachingSession.objects.filter(
                end_time__gte=now, is_cancelled=False,
            ).count(),
            'meetings': Meeting.objects.filter(
                scheduled_end__gte=now,
                status__in=['scheduled', 'live'],
            ).count(),
        }

        def _iso_day(row, key='day'):
            d = row.get(key) or row.get('month')
            return d.isoformat() if d else None

        period = {'days': days, 'months': months}
        if window['custom']:
            period['start_date'] = window['start_date'].isoformat()
            period['end_date'] = window['end_date'].isoformat()

        return Response({
            'generated_at': now.isoformat(),
            'period': period,
            'summary': {
                'total_users': users.count(),
                'active_users': users.filter(is_active=True, status='active').count(),
                'total_courses': Course.objects.count(),
                'published_courses': Course.objects.filter(is_published=True).count(),
                'total_sessions': sessions.count(),
                'certificates_issued': certs.count(),
            },
            'charts': {
                'user_growth': [
                    {'date': _iso_day(r), 'count': r['count']} for r in user_growth
                ],
                'users_by_role': [
                    {'role': r['role'], 'count': r['count']} for r in users_by_role
                ],
                'users_by_status': [
                    {'status': r['status'], 'count': r['count']} for r in users_by_status
                ],
                'users_by_department': by_department,
                'login_activity': [
                    {'date': _iso_day(r), 'count': r['count']} for r in login_activity
                ],
                'simulations_by_status': [
                    {'status': r['status'], 'count': r['count']} for r in simulations_by_status
                ],
                'simulation_performance_trend': [
                    {
                        'period': r['month'].strftime('%Y-%m') if r['month'] else None,
                        'avg_score': round(r['avg_score'] or 0, 2),
                        'completions': r['completions'],
                        'active_learners': r['learners'],
                    }
                    for r in simulation_scores_trend
                ],
                'enrollments_trend': [
                    {
                        'period': r['month'].strftime('%Y-%m') if r['month'] else None,
                        'count': r['count'],
                    }
                    for r in enrollments_trend
                ],
                'courses_by_publish': [
                    {
                        'label': 'Published' if r['is_published'] else 'Draft',
                        'count': r['count'],
                    }
                    for r in courses_by_publish
                ],
                'certificates_by_level': [
                    {
                        'level': DIFFICULTY_LABELS.get(
                            r['enrollment__course__difficulty'], 'Unknown',
                        ),
                        'count': r['count'],
                    }
                    for r in certificates_by_level
                ],
                'certificate_issuance_trend': [
                    {
                        'period': r['month'].strftime('%Y-%m') if r['month'] else None,
                        'count': r['count'],
                    }
                    for r in certificate_trend
                ],
                'errors_by_day': [
                    {'date': _iso_day(r), 'count': r['count']} for r in errors_by_day
                ],
                'schedule_upcoming': schedule_upcoming,
            },
        })
