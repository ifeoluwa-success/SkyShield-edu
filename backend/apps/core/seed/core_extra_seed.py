"""Seed core audit logs, API logs, notifications, fake billing settings."""
from __future__ import annotations

import uuid
from datetime import timedelta

from django.utils import timezone

from apps.core.models import APILog, AuditLog, ErrorLog, Notification, NotificationRecipient, SystemSetting

from .constants import SEED_TAG


def seed_core_extra(ctx) -> None:
    ctx.write('Seeding core logs, notifications, billing settings...')

    # Fake subscriptions / payments (no Payment model — stored as system settings)
    SystemSetting.objects.update_or_create(
        key='billing.subscriptions',
        defaults={
            'value': [
                {
                    'id': str(uuid.uuid4()),
                    'org': ctx.rng.choice(['NCAA', 'FAAN', 'SkyShield Academy']),
                    'plan': ctx.rng.choice(['enterprise', 'team', 'trainee_pro']),
                    'status': ctx.rng.choice(['active', 'active', 'past_due', 'cancelled']),
                    'seats': ctx.rng.randint(25, 500),
                    'currency': 'NGN',
                    'amount_monthly': ctx.rng.randint(150000, 2500000),
                    'renewal_date': (timezone.now() + timedelta(days=ctx.rng.randint(5, 90))).date().isoformat(),
                }
                for _ in range(12)
            ],
            'description': f'{SEED_TAG} Synthetic subscription ledger for UI/testing',
            'is_public': False,
            'data_type': 'json',
        },
    )
    SystemSetting.objects.update_or_create(
        key='billing.transactions',
        defaults={
            'value': [
                {
                    'id': f'TXN-{uuid.uuid4().hex[:10].upper()}',
                    'method': ctx.rng.choice(['card', 'bank_transfer', 'purchase_order']),
                    'status': ctx.rng.choice(['succeeded', 'succeeded', 'pending', 'failed']),
                    'amount': ctx.rng.randint(50000, 800000),
                    'currency': 'NGN',
                    'paid_at': (timezone.now() - timedelta(days=ctx.rng.randint(0, 120))).isoformat(),
                }
                for _ in range(40)
            ],
            'description': f'{SEED_TAG} Fake payment history (not real money)',
            'is_public': False,
            'data_type': 'json',
        },
    )

    audit_batch = []
    for _ in range(300):
        user = ctx.rng.choice(ctx.all_users)
        audit_batch.append(AuditLog(
            user=user,
            action=ctx.rng.choice(['CREATE', 'UPDATE', 'VIEW', 'LOGIN', 'LOGOUT']),
            app_name=ctx.rng.choice(['users', 'simulations', 'content', 'meetings']),
            model_name=ctx.rng.choice(['User', 'Scenario', 'LearningMaterial', 'Meeting']),
            object_id=str(uuid.uuid4()),
            object_repr=f'{SEED_TAG} object',
            ip_address='102.89.1.1',
            timestamp=timezone.now() - timedelta(days=ctx.rng.randint(0, 60)),
        ))
    AuditLog.objects.bulk_create(audit_batch, batch_size=500)
    ctx.write(f'  Audit logs: {len(audit_batch)}.')

    api_paths = [
        '/api/users/profile/',
        '/api/simulations/courses/',
        '/api/content/materials/',
        '/api/simulations/incidents/',
        '/api/tutor/trainee/exercises/status/',
    ]
    api_batch = []
    for _ in range(ctx.scale['api_logs']):
        api_batch.append(APILog(
            user=ctx.rng.choice(ctx.all_users) if ctx.rng.random() < 0.9 else None,
            path=ctx.rng.choice(api_paths),
            method=ctx.rng.choice(['GET', 'GET', 'POST', 'PATCH']),
            query_params={},
            request_body={},
            response_status=ctx.rng.choice([200, 200, 201, 400, 401, 404, 500]),
            response_body={},
            ip_address='127.0.0.1',
            execution_time=ctx.rng.uniform(0.02, 2.5),
            timestamp=timezone.now() - timedelta(hours=ctx.rng.randint(0, 720)),
        ))
    APILog.objects.bulk_create(api_batch, batch_size=1000)
    ctx.write(f'  API logs: {len(api_batch)}.')

    error_batch = [
        ErrorLog(
            level=ctx.rng.choice(['warning', 'error', 'info']),
            message=ctx.rng.choice([
                'Redis timeout on channel layer',
                'Upstream email provider delay',
                'Simulation state sync retry',
            ]),
            url=ctx.rng.choice(api_paths),
            method='GET',
            user=ctx.rng.choice(ctx.all_users) if ctx.rng.random() < 0.5 else None,
        )
        for _ in range(15)
    ]
    ErrorLog.objects.bulk_create(error_batch, batch_size=50)

    notifications = [
        Notification(
            title=f'{SEED_TAG} {ctx.rng.choice(["Maintenance", "New course", "Policy update"])}',
            message='Platform notification for seeded environment.',
            notification_type=ctx.rng.choice(['info', 'warning', 'success']),
            is_global=ctx.rng.random() < 0.3,
            created_by=ctx.rng.choice(ctx.admins),
        )
        for _ in range(20)
    ]
    Notification.objects.bulk_create(notifications, batch_size=50)

    recipient_batch = []
    for notification in notifications:
        if notification.is_global:
            continue
        for user in ctx.rng.sample(ctx.all_users, k=min(30, len(ctx.all_users))):
            recipient_batch.append(NotificationRecipient(
                notification=notification,
                user=user,
                is_read=ctx.rng.random() < 0.4,
            ))
    if recipient_batch:
        NotificationRecipient.objects.bulk_create(
            recipient_batch,
            batch_size=500,
            ignore_conflicts=True,
        )

    ctx.write('  Core extras created.')
