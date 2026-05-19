"""Seed users, profiles, sessions, devices, and activity."""
from __future__ import annotations

import secrets
import uuid
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.utils import timezone

from apps.users.models import (
    EmailVerificationToken,
    PasswordResetToken,
    UserActivity,
    UserDevice,
    UserNotification,
    UserSession,
)

from .constants import (
    CITIES_NG,
    DEPARTMENTS,
    FIRST_NAMES_F,
    FIRST_NAMES_M,
    LAST_NAMES,
    ORGANIZATIONS,
    PINNED_ACCOUNTS,
    SEED_TAG,
)

User = get_user_model()


def _build_user(ctx, *, email, username, role, first_name, last_name, status, password_hash, **extra):
    city, state = ctx.rng.choice(CITIES_NG)
    org = ctx.rng.choice(ORGANIZATIONS)
    days_ago = ctx.rng.randint(1, 180)
    now = timezone.now()
    return User(
        email=email,
        username=username,
        password=password_hash,
        first_name=first_name,
        last_name=last_name,
        role=role,
        status=status,
        organization=extra.get('organization', org),
        department=extra.get('department', ctx.rng.choice(DEPARTMENTS)),
        phone_number=extra.get('phone_number', f'+234{ctx.rng.randint(700, 909)}{ctx.rng.randint(1000000, 9999999)}'),
        job_title=extra.get('job_title', role.title()),
        employee_id=extra.get('employee_id', f'{org[:3].upper()}-{ctx.rng.randint(1000, 9999)}'),
        clearance_level=ctx.rng.choice(['Basic', 'Confidential', 'Secret']) if role != 'trainee' else 'Basic',
        training_level=extra.get('training_level', ctx.rng.choice(['Beginner', 'Intermediate', 'Advanced'])),
        email_verified=status == 'active',
        is_active=status != 'suspended',
        is_staff=role in ('admin', 'supervisor'),
        is_superuser=role == 'admin',
        address=f'{ctx.rng.randint(1, 120)} Airport Road, {city}, {state}, Nigeria',
        bio=extra.get('bio', f'{SEED_TAG} {role} at {org}.'),
        certifications=extra.get('certifications', ['AVSEC Awareness', 'ICAO Annex 17']),
        weak_areas=ctx.rng.sample(['phishing', 'ransomware', 'gps_spoofing'], k=ctx.rng.randint(0, 2)),
        strong_areas=ctx.rng.sample(['communication', 'navigation'], k=ctx.rng.randint(1, 2)),
        last_login=now - timedelta(days=ctx.rng.randint(0, 14), hours=ctx.rng.randint(0, 12)),
        last_active=now - timedelta(hours=ctx.rng.randint(0, 48)),
        date_joined=now - timedelta(days=days_ago),
    )


def seed_users(ctx) -> None:
    ctx.write('Seeding users...')
    password_hash = make_password(ctx.password)
    to_create: list[User] = []
    used_emails: set[str] = set()
    used_usernames: set[str] = set()

    for spec in PINNED_ACCOUNTS:
        email = spec['email']
        username = spec['username']
        used_emails.add(email)
        used_usernames.add(username)
        to_create.append(_build_user(ctx, password_hash=password_hash, **spec))

    def bulk_role(role, count, name_m, name_f, domain):
        prefix = {'admin': 'adm', 'supervisor': 'sup', 'instructor': 'ins', 'trainee': 'tr'}.get(role, 'usr')
        for i in range(count):
            fn = ctx.rng.choice(name_m if ctx.rng.random() > 0.45 else name_f)
            ln = ctx.rng.choice(LAST_NAMES)
            email = f'{fn.lower()}.{ln.lower()}.{prefix}{i + 1}@{domain}'
            while email in used_emails:
                email = f'{fn.lower()}.{ln.lower()}.{prefix}{i + 1}.{ctx.rng.randint(10, 99)}@{domain}'
            used_emails.add(email)
            username = f'{prefix}_{fn[:1].lower()}{ln.lower()}{i + 1}'
            while username in used_usernames:
                username = f'{prefix}_{fn[:1].lower()}{ln.lower()}{i + 1}_{ctx.rng.randint(10, 99)}'
            used_usernames.add(username)
            status = ctx.rng.choices(
                ['active', 'active', 'active', 'pending', 'inactive', 'suspended'],
                weights=[50, 20, 10, 10, 5, 5],
            )[0]
            to_create.append(_build_user(
                ctx,
                email=email,
                username=username,
                role=role,
                first_name=fn,
                last_name=ln,
                status=status,
                password_hash=password_hash,
            ))

    bulk_role('admin', ctx.scale['admins'], FIRST_NAMES_M, FIRST_NAMES_F, 'skyshield.africa')
    bulk_role('supervisor', ctx.scale['supervisors'], FIRST_NAMES_M, FIRST_NAMES_F, 'ncaa-training.gov.ng')
    bulk_role('instructor', ctx.scale['instructors'], FIRST_NAMES_M, FIRST_NAMES_F, 'instructors.skyshield.africa')
    bulk_role('trainee', ctx.scale['trainees'], FIRST_NAMES_M, FIRST_NAMES_F, 'trainees.skyshield.africa')

    User.objects.bulk_create(to_create, batch_size=500)

    ctx.all_users = list(User.objects.all())
    ctx.admins = [u for u in ctx.all_users if u.role == 'admin']
    ctx.supervisors = [u for u in ctx.all_users if u.role == 'supervisor']
    ctx.instructors = [u for u in ctx.all_users if u.role == 'instructor']
    ctx.trainees = [u for u in ctx.all_users if u.role == 'trainee']
    ctx.staff_users = ctx.admins + ctx.supervisors + ctx.instructors

    _seed_user_satellites(ctx)
    ctx.write(f'  Users: {len(ctx.all_users)} total ({len(ctx.trainees)} trainees).')


def _seed_user_satellites(ctx) -> None:
    activity_types = [c[0] for c in UserActivity.ACTIVITY_TYPES]
    devices_batch = []
    sessions_batch = []
    activities_batch = []
    notifications_batch = []

    cap = min(len(ctx.all_users), 200)
    for user in ctx.all_users[:cap]:
        for _ in range(ctx.rng.randint(1, 2)):
            devices_batch.append(UserDevice(
                user=user,
                device_id=str(uuid.uuid4()),
                device_name=ctx.rng.choice(['Samsung Galaxy A54', 'iPhone 14', 'Dell Latitude 5540']),
                device_type=ctx.rng.choice(['mobile', 'desktop', 'tablet']),
                is_trusted=ctx.rng.random() < 0.6,
            ))
        if user.status == 'active':
            sessions_batch.append(UserSession(
                user=user,
                session_id=secrets.token_hex(16),
                ip_address=f'102.{ctx.rng.randint(0, 255)}.{ctx.rng.randint(0, 255)}.{ctx.rng.randint(1, 254)}',
                user_agent='Mozilla/5.0',
                device_info={'os': 'Windows', 'browser': 'Chrome'},
                location={'city': ctx.rng.choice(CITIES_NG)[0], 'country': 'NG'},
                is_mobile=ctx.rng.random() < 0.35,
            ))
        for _ in range(ctx.rng.randint(2, min(8, ctx.scale['activities_per_user']))):
            activities_batch.append(UserActivity(
                user=user,
                activity_type=ctx.rng.choice(activity_types),
                metadata={'seed': True},
                ip_address='127.0.0.1',
                timestamp=timezone.now() - timedelta(days=ctx.rng.randint(0, 60)),
            ))
        if ctx.rng.random() < 0.5:
            notifications_batch.append(UserNotification(
                user=user,
                type=ctx.rng.choice(['info', 'success', 'warning', 'achievement']),
                title='Training reminder',
                message='Review your pending modules on the dashboard.',
                is_read=ctx.rng.random() < 0.5,
            ))
        if ctx.rng.random() < 0.05 and user.status == 'pending':
            EmailVerificationToken.objects.create(
                user=user,
                token=secrets.token_urlsafe(32),
                expires_at=timezone.now() + timedelta(days=2),
            )
        if ctx.rng.random() < 0.03:
            PasswordResetToken.objects.create(
                user=user,
                token=secrets.token_urlsafe(32),
                expires_at=timezone.now() + timedelta(hours=24),
                is_used=ctx.rng.random() < 0.5,
            )

    UserDevice.objects.bulk_create(devices_batch, batch_size=500, ignore_conflicts=True)
    UserSession.objects.bulk_create(sessions_batch, batch_size=500)
    UserActivity.objects.bulk_create(activities_batch, batch_size=1000)
    UserNotification.objects.bulk_create(notifications_batch, batch_size=500)
