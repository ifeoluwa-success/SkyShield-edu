"""
Platform-wide analytics for admin, supervisor, and instructor dashboards.
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, Q
from django.db.models.functions import TruncDate, TruncMonth
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.simulations.models import CourseCertificate, SimulationSession
from apps.simulations.permissions import IsPlatformAnalyticsStaff, user_role

User = get_user_model()


class PlatformOverviewView(APIView):
    """GET /api/analytics/platform/overview/"""

    permission_classes = [permissions.IsAuthenticated, IsPlatformAnalyticsStaff]

    def get(self, request):
        now = timezone.now()
        week_ago = now - timedelta(days=7)
        month_ago = now - timedelta(days=30)

        users = User.objects.all()
        by_role = dict(
            users.values('role').annotate(c=Count('id')).values_list('role', 'c')
        )
        total = users.count()
        active = users.filter(is_active=True, status='active').count()

        sessions = SimulationSession.objects.all()
        cert_qs = CourseCertificate.objects.select_related('enrollment__course')

        return Response({
            'generated_at': now.isoformat(),
            'users': {
                'total': total,
                'active': active,
                'inactive': total - active,
                'by_role': {
                    'trainee': by_role.get('trainee', 0),
                    'supervisor': by_role.get('supervisor', 0),
                    'instructor': by_role.get('instructor', 0),
                    'admin': by_role.get('admin', 0),
                },
                'new_last_7_days': users.filter(created_at__gte=week_ago).count(),
                'new_last_30_days': users.filter(created_at__gte=month_ago).count(),
            },
            'simulations': {
                'total_sessions': sessions.count(),
                'completed': sessions.filter(status='completed').count(),
                'failed': sessions.filter(status='failed').count(),
                'abandoned': sessions.filter(status='abandoned').count(),
                'avg_score': round(
                    sessions.filter(status='completed').aggregate(a=Avg('score'))['a'] or 0,
                    2,
                ),
                'active_learners_30d': sessions.filter(
                    started_at__gte=month_ago,
                ).values('user').distinct().count(),
            },
            'certificates': {
                'total_issued': cert_qs.count(),
                'last_30_days': cert_qs.filter(issued_at__gte=month_ago).count(),
            },
        })


class PlatformUserAnalyticsView(APIView):
    """GET /api/analytics/platform/users/"""

    permission_classes = [permissions.IsAuthenticated, IsPlatformAnalyticsStaff]

    def get(self, request):
        period = request.query_params.get('period', '30')
        try:
            days = max(1, min(365, int(period)))
        except ValueError:
            days = 30
        since = timezone.now() - timedelta(days=days)

        growth = list(
            User.objects.filter(created_at__gte=since)
            .annotate(day=TruncDate('created_at'))
            .values('day')
            .annotate(count=Count('id'))
            .order_by('day')
        )

        logins = []
        try:
            from apps.users.models import UserActivity
            logins = list(
                UserActivity.objects.filter(
                    activity_type='login',
                    timestamp__gte=since,
                )
                .annotate(day=TruncDate('timestamp'))
                .values('day')
                .annotate(count=Count('id'))
                .order_by('day')
            )
        except Exception:
            pass

        by_department = list(
            User.objects.exclude(department='')
            .values('department')
            .annotate(count=Count('id'))
            .order_by('-count')[:20]
        )

        return Response({
            'period_days': days,
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
        months = min(24, max(1, int(request.query_params.get('months', 6))))
        since = timezone.now() - timedelta(days=months * 31)

        qs = (
            SimulationSession.objects.filter(
                status='completed',
                completed_at__gte=since,
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

        return Response({'trends': rows})


class PlatformCertificationAnalyticsView(APIView):
    """GET /api/analytics/platform/certifications/"""

    permission_classes = [permissions.IsAuthenticated, IsPlatformAnalyticsStaff]

    def get(self, request):
        certs = CourseCertificate.objects.select_related(
            'enrollment__course',
            'enrollment__trainee',
        )

        difficulty_labels = {
            1: 'Beginner',
            2: 'Intermediate',
            3: 'Advanced',
            4: 'Expert',
        }
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
            'total_issued': certs.count(),
            'by_course_difficulty': [
                {
                    'difficulty': r['enrollment__course__difficulty'],
                    'level': difficulty_labels.get(
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
        sessions = SimulationSession.objects.all()
        multi = (
            sessions.values('user', 'scenario')
            .annotate(attempts=Count('id'))
            .filter(attempts__gt=1)
            .count()
        )
        exhausted = sessions.filter(status='failed').count()
        return Response({
            'total_sessions': sessions.count(),
            'scenarios_with_retries': multi,
            'failed_sessions': exhausted,
            'avg_attempt_number': round(
                sessions.aggregate(a=Avg('attempt_number'))['a'] or 1,
                2,
            ),
        })
