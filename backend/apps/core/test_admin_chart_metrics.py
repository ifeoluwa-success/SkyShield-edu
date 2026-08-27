from datetime import datetime

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import ErrorLog

User = get_user_model()
METRICS_URL = '/api/core/admin/metrics/charts/'


def _aware(year, month, day, hour=12, minute=0):
    return timezone.make_aware(datetime(year, month, day, hour, minute))


class AdminChartMetricsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            email='metrics-admin@example.com',
            username='metricsadmin',
            password='testpass123',
            role='admin',
            status='active',
        )
        self.client.force_authenticate(user=self.admin)

    def test_unauthenticated_denied(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(METRICS_URL)
        self.assertEqual(response.status_code, 401)

    def test_default_metrics_uses_30_days(self):
        response = self.client.get(METRICS_URL)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['period']['days'], 30)
        self.assertIn('charts', response.data)
        self.assertIn('user_growth', response.data['charts'])
        self.assertNotIn('start_date', response.data['period'])

    def test_preset_7_30_90_day_filters(self):
        for days in (7, 30, 90):
            response = self.client.get(METRICS_URL, {'days': days})
            self.assertEqual(response.status_code, 200, days)
            self.assertEqual(response.data['period']['days'], days)

    def test_custom_range_returns_metrics(self):
        response = self.client.get(
            METRICS_URL,
            {'start_date': '2026-08-01', 'end_date': '2026-08-27'},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['period']['start_date'], '2026-08-01')
        self.assertEqual(response.data['period']['end_date'], '2026-08-27')
        self.assertEqual(response.data['period']['days'], 27)

    def test_custom_range_includes_start_and_end_dates(self):
        inside_start = User.objects.create_user(
            email='in-start@example.com',
            username='instart',
            password='testpass123',
            role='trainee',
        )
        inside_end = User.objects.create_user(
            email='in-end@example.com',
            username='inend',
            password='testpass123',
            role='trainee',
        )
        before = User.objects.create_user(
            email='before@example.com',
            username='before',
            password='testpass123',
            role='trainee',
        )
        after = User.objects.create_user(
            email='after@example.com',
            username='after',
            password='testpass123',
            role='trainee',
        )
        User.objects.filter(pk=inside_start.pk).update(created_at=_aware(2026, 8, 20, 0, 0))
        User.objects.filter(pk=inside_end.pk).update(created_at=_aware(2026, 8, 22, 23, 30))
        User.objects.filter(pk=before.pk).update(created_at=_aware(2026, 8, 19, 23, 0))
        User.objects.filter(pk=after.pk).update(created_at=_aware(2026, 8, 23, 0, 0))

        response = self.client.get(
            METRICS_URL,
            {'start_date': '2026-08-20', 'end_date': '2026-08-22'},
        )
        self.assertEqual(response.status_code, 200)
        dates = {row['date'][:10] for row in response.data['charts']['user_growth'] if row['date']}
        self.assertIn('2026-08-20', dates)
        self.assertIn('2026-08-22', dates)
        self.assertNotIn('2026-08-19', dates)
        self.assertNotIn('2026-08-23', dates)
        total = sum(row['count'] for row in response.data['charts']['user_growth'])
        self.assertEqual(total, 2)

    def test_same_day_range_is_inclusive(self):
        user = User.objects.create_user(
            email='same-day@example.com',
            username='sameday',
            password='testpass123',
            role='trainee',
        )
        User.objects.filter(pk=user.pk).update(created_at=_aware(2026, 8, 15, 18, 0))
        response = self.client.get(
            METRICS_URL,
            {'start_date': '2026-08-15', 'end_date': '2026-08-15'},
        )
        self.assertEqual(response.status_code, 200)
        total = sum(row['count'] for row in response.data['charts']['user_growth'])
        self.assertEqual(total, 1)

    def test_start_after_end_rejected(self):
        response = self.client.get(
            METRICS_URL,
            {'start_date': '2026-08-27', 'end_date': '2026-08-01'},
        )
        self.assertEqual(response.status_code, 400)

    def test_invalid_dates_rejected(self):
        response = self.client.get(
            METRICS_URL,
            {'start_date': 'not-a-date', 'end_date': '2026-08-01'},
        )
        self.assertEqual(response.status_code, 400)
        response = self.client.get(
            METRICS_URL,
            {'start_date': '2026-13-40', 'end_date': '2026-08-01'},
        )
        self.assertEqual(response.status_code, 400)

    def test_missing_custom_dates_rejected(self):
        response = self.client.get(METRICS_URL, {'start_date': '2026-08-01'})
        self.assertEqual(response.status_code, 400)
        response = self.client.get(METRICS_URL, {'end_date': '2026-08-27'})
        self.assertEqual(response.status_code, 400)

    def test_range_exceeding_max_rejected(self):
        response = self.client.get(
            METRICS_URL,
            {'start_date': '2024-01-01', 'end_date': '2026-01-10'},
        )
        self.assertEqual(response.status_code, 400)

    def test_empty_custom_range_returns_empty_series(self):
        ErrorLog.objects.create(message='old error', level='error')
        ErrorLog.objects.all().update(created_at=_aware(2026, 8, 10))
        response = self.client.get(
            METRICS_URL,
            {'start_date': '2020-01-01', 'end_date': '2020-01-02'},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['charts']['user_growth'], [])
        self.assertEqual(response.data['charts']['errors_by_day'], [])

    def test_errors_in_custom_range_are_included(self):
        log = ErrorLog.objects.create(message='in range', level='error')
        ErrorLog.objects.filter(pk=log.pk).update(created_at=_aware(2026, 8, 12, 8, 0))
        response = self.client.get(
            METRICS_URL,
            {'start_date': '2026-08-12', 'end_date': '2026-08-12'},
        )
        self.assertEqual(response.status_code, 200)
        total = sum(row['count'] for row in response.data['charts']['errors_by_day'])
        self.assertEqual(total, 1)
