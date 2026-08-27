"""Shared date-window parsing for platform and admin dashboard metrics."""

from datetime import datetime, time, timedelta

from django.utils.dateparse import parse_date
from django.utils import timezone
from rest_framework.response import Response

MAX_METRICS_RANGE_DAYS = 365


def aware_day_start(d):
    return timezone.make_aware(datetime.combine(d, time.min))


def filter_in_window(qs, field, start_dt, end_dt=None):
    if start_dt is None:
        return qs
    qs = qs.filter(**{f'{field}__gte': start_dt})
    if end_dt is not None:
        qs = qs.filter(**{f'{field}__lt': end_dt})
    return qs


def filter_snapshot(qs, field, until):
    """Cumulative records strictly before until (through end of inclusive date range)."""
    if until is None:
        return qs
    return qs.filter(**{f'{field}__lt': until})


def period_payload(window):
    payload = {'all_time': window.get('all_time', False)}
    if window.get('days') is not None:
        payload['days'] = window['days']
    if window.get('custom'):
        payload['start_date'] = window['start_date'].isoformat()
        payload['end_date'] = window['end_date'].isoformat()
        payload['custom'] = True
        payload['snapshot'] = True
    else:
        payload['custom'] = False
        payload['snapshot'] = False
    return payload


def parse_metrics_window(request, default_days=None):
    """
    Preset: ?days=7|30|90 — rolling window ending now.
    Custom: ?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD — inclusive calendar dates (UTC).
    No params: all-time when default_days is None; otherwise use default_days.
    """
    start_raw = request.query_params.get('start_date')
    end_raw = request.query_params.get('end_date')

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
        range_start = aware_day_start(start)
        range_end = aware_day_start(end + timedelta(days=1))
        return {
            'days': span_days,
            'since': range_start,
            'until': range_end,
            'start_date': start,
            'end_date': end,
            'custom': True,
            'all_time': False,
        }, None

    days_param = request.query_params.get('days')
    if days_param is not None:
        try:
            days = max(1, min(MAX_METRICS_RANGE_DAYS, int(days_param)))
        except (TypeError, ValueError):
            return None, Response({'error': 'Invalid days parameter'}, status=400)
    elif default_days is not None:
        days = max(1, min(MAX_METRICS_RANGE_DAYS, default_days))
    else:
        return {
            'days': None,
            'since': None,
            'until': None,
            'start_date': None,
            'end_date': None,
            'custom': False,
            'all_time': True,
        }, None

    now = timezone.now()
    since = now - timedelta(days=days)
    return {
        'days': days,
        'since': since,
        'until': None,
        'start_date': None,
        'end_date': None,
        'custom': False,
        'all_time': False,
    }, None
