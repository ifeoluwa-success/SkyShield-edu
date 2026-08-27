"""
Platform-wide analytics for admin, supervisor, and instructor dashboards.
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count
from django.db.models.functions import TruncDate, TruncMonth
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.analytics.metrics_window import filter_in_window, parse_metrics_window, period_payload
from apps.simulations.models import CourseCertificate, SimulationSession
from apps.simulations.permissions import IsPlatformAnalyticsStaff

User = get_user_model()

DIFFICULTY_LABELS = {
    1: 'Beginner',
    2: 'Intermediate',
    3: 'Advanced',
    4: 'Expert',
}


def _window_or_error(request, default_days=30):
    return parse_metrics_window(request, default_days=default_days)


class PlatformOverviewView(APIView):
    """GET /api/analytics/platform/overview/"""

    permission_classes = [permissions.IsAuthenticated, IsPlatformAnalyticsStaff]

    def get(self, request):
        window, error = _window_or_error(request, default_days=None)
        if error is not None:
            return error

        now = timezone.now()
        since = window['since']
        until = window['until']
        all_time = window.get('all_time', False)

        users_qs = User.objects.all()
        if all_time:
            week_ago = now - timedelta(days=7)
            month_ago = now - timedelta(days=30)
            by_role = dict(
                users_qs.values('role').annotate(c=Count('id')).values_list('role', 'c')
            )
            total = users_qs.count()
            active = users_qs.filter(is_active=True, status='active').count()
            users_payload = {
                'total': total,
                'active': active,
                'inactive': total - active,
                'by_role': {
                    'trainee': by_role.get('trainee', 0),
                    'supervisor': by_role.get('supervisor', 0),
                    'instructor': by_role.get('instructor', 0),
                    'admin': by_role.get('admin', 0),
                },
                'new_last_7_days': users_qs.filter(created_at__gte=week_ago).count(),
                'new_last_30_days': users_qs.filter(created_at__gte=month_ago).count(),
                'new_in_period': users_qs.filter(created_at__gte=month_ago).count(),
            }
            sessions_in_period = SimulationSession.objects.all()
            cert_qs = CourseCertificate.objects.select_related('enrollment__course')
            month_ago_cert = cert_qs.filter(issued_at__gte=month_ago).count()
            sims_payload = {
                'total_sessions': sessions_in_period.count(),
                'completed': sessions_in_period.filter(status='completed').count(),
                'failed': sessions_in_period.filter(status='failed').count(),
                'abandoned': sessions_in_period.filter(status='abandoned').count(),
                'avg_score': round(
                    sessions_in_period.filter(status='completed').aggregate(a=Avg('score'))['a'] or 0,
                    2,
                ),
                'active_learners_30d': sessions_in_period.filter(
                    started_at__gte=month_ago,
                ).values('user').distinct().count(),
            }
            certs_payload = {
                'total_issued': cert_qs.count(),
                'last_30_days': month_ago_cert,
                'in_period': month_ago_cert,
            }
        else:
            users_in_period = filter_in_window(users_qs, 'created_at', since, until)
            by_role = dict(
                users_in_period.values('role').annotate(c=Count('id')).values_list('role', 'c')
            )
            active_in_period = 0
            try:
                from apps.users.models import UserActivity
                active_in_period = (
                    filter_in_window(
                        UserActivity.objects.filter(activity_type='login'),
                        'timestamp',
                        since,
                        until,
                    )
                    .values('user')
                    .distinct()
                    .count()
                )
            except Exception:
                active_in_period = users_in_period.filter(is_active=True, status='active').count()

            sessions_in_period = filter_in_window(
                SimulationSession.objects.all(), 'started_at', since, until,
            )
            certs_in_period = filter_in_window(
                CourseCertificate.objects.select_related('enrollment__course'),
                'issued_at',
                since,
                until,
            )
            users_payload = {
                'total': users_in_period.count(),
                'active': active_in_period,
                'inactive': users_in_period.filter(is_active=False).count(),
                'by_role': {
                    'trainee': by_role.get('trainee', 0),
                    'supervisor': by_role.get('supervisor', 0),
                    'instructor': by_role.get('instructor', 0),
                    'admin': by_role.get('admin', 0),
                },
                'new_in_period': users_in_period.count(),
            }
            sims_payload = {
                'total_sessions': sessions_in_period.count(),
                'completed': sessions_in_period.filter(status='completed').count(),
                'failed': sessions_in_period.filter(status='failed').count(),
                'abandoned': sessions_in_period.filter(status='abandoned').count(),
                'avg_score': round(
                    sessions_in_period.filter(status='completed').aggregate(a=Avg('score'))['a'] or 0,
                    2,
                ),
                'active_learners': sessions_in_period.values('user').distinct().count(),
            }
            certs_payload = {
                'total_issued': certs_in_period.count(),
                'in_period': certs_in_period.count(),
            }

        return Response({
            'generated_at': now.isoformat(),
            'period': period_payload(window),
            'users': users_payload,
            'simulations': sims_payload,
            'certificates': certs_payload,
        })


class PlatformUserAnalyticsView(APIView):
    """GET /api/analytics/platform/users/"""

    permission_classes = [permissions.IsAuthenticated, IsPlatformAnalyticsStaff]

    def get(self, request):
        window, error = _window_or_error(request)
        if error is not None:
            return error

        since = window['since']
        until = window['until']

        growth = list(
            filter_in_window(User.objects.all(), 'created_at', since, until)
            .annotate(day=TruncDate('created_at'))
            .values('day')
            .annotate(count=Count('id'))
            .order_by('day')
        )

        logins = []
        try:
            from apps.users.models import UserActivity
            logins = list(
                filter_in_window(
                    UserActivity.objects.filter(activity_type='login'),
                    'timestamp',
                    since,
                    until,
                )
                .annotate(day=TruncDate('timestamp'))
                .values('day')
                .annotate(count=Count('id'))
                .order_by('day')
            )
        except Exception:
            pass

        by_department = list(
            filter_in_window(User.objects.exclude(department=''), 'created_at', since, until)
            .values('department')
            .annotate(count=Count('id'))
            .order_by('-count')[:20]
        )

        return Response({
            'period': period_payload(window),
            'period_days': window['days'] or 0,
            'registration_trend': [
                {'date': row['day'].isoformat(), 'count': row['count']} for row in growth
            ],
            'login_trend': [
                {'date': row['day'].isoformat(), 'count': row['count']} for row in logins
            ],
            'by_department': by_department,
        })


class PlatformPerformanceTrendsView(APIView):
    """GET /api/analytics/platform/performance-trends/"""

    permission_classes = [permissions.IsAuthenticated, IsPlatformAnalyticsStaff]

    def get(self, request):
        window, error = _window_or_error(request, default_days=None)
        if error is not None:
            return error

        since = window['since']
        until = window['until']

        qs = (
            filter_in_window(
                SimulationSession.objects.filter(status='completed'),
                'completed_at',
                since,
                until,
            )
            .annotate(month=TruncMonth('completed_at'))
            .values('month')
            .annotate(
                avg_score=Avg('score'),
                completions=Count('id'),
                active_learners=Count('user', distinct=True),
            )
            .order_by('month')
        )

        rows = []
        for row in qs:
            learners = row['active_learners'] or 1
            rows.append({
                'period': row['month'].strftime('%Y-%m') if row['month'] else None,
                'avg_score': round(row['avg_score'] or 0, 2),
                'completions': row['completions'],
                'active_learners': row['active_learners'],
                'avg_sessions_per_user': round(row['completions'] / learners, 2),
            })

        return Response({'period': period_payload(window), 'trends': rows})


class PlatformCertificationAnalyticsView(APIView):
    """GET /api/analytics/platform/certifications/"""

    permission_classes = [permissions.IsAuthenticated, IsPlatformAnalyticsStaff]

    def get(self, request):
        window, error = _window_or_error(request)
        if error is not None:
            return error

        since = window['since']
        until = window['until']

        certs = filter_in_window(
            CourseCertificate.objects.select_related(
                'enrollment__course',
                'enrollment__trainee',
            ),
            'issued_at',
            since,
            until,
        )

        by_difficulty = list(
            certs.values('enrollment__course__difficulty')
            .annotate(count=Count('id'))
            .order_by('enrollment__course__difficulty')
        )

        trend = list(
            certs.annotate(month=TruncMonth('issued_at'))
            .values('month')
            .annotate(count=Count('id'))
            .order_by('month')
        )

        leaderboard = list(
            certs.values('enrollment__trainee__email')
            .annotate(certificates=Count('id'))
            .order_by('-certificates')[:15]
        )

        return Response({
            'period': period_payload(window),
            'total_issued': certs.count(),
            'by_course_difficulty': [
                {
                    'difficulty': r['enrollment__course__difficulty'],
                    'level': DIFFICULTY_LABELS.get(
                        r['enrollment__course__difficulty'], 'Unknown',
                    ),
                    'count': r['count'],
                }
                for r in by_difficulty
            ],
            'issuance_trend': [
                {
                    'period': r['month'].strftime('%Y-%m') if r['month'] else None,
                    'count': r['count'],
                }
                for r in trend
            ],
            'leaderboard': [
                {'email': r['enrollment__trainee__email'], 'certificates': r['certificates']}
                for r in leaderboard
            ],
        })


class PlatformRetryAnalyticsView(APIView):
    """GET /api/analytics/platform/retries/"""

    permission_classes = [permissions.IsAuthenticated, IsPlatformAnalyticsStaff]

    def get(self, request):
        window, error = _window_or_error(request)
        if error is not None:
            return error

        since = window['since']
        until = window['until']
        sessions = filter_in_window(SimulationSession.objects.all(), 'started_at', since, until)

        multi = (
            sessions.values('user', 'scenario')
            .annotate(attempts=Count('id'))
            .filter(attempts__gt=1)
            .count()
        )
        exhausted = sessions.filter(status='failed').count()
        return Response({
            'period': period_payload(window),
            'total_sessions': sessions.count(),
            'scenarios_with_retries': multi,
            'failed_sessions': exhausted,
            'avg_attempt_number': round(
                sessions.aggregate(a=Avg('attempt_number'))['a'] or 1,
                2,
            ),
        })
