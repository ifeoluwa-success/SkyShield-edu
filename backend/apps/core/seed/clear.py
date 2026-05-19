"""Clear all table data without dropping schema (Django flush + fallback)."""
from __future__ import annotations

from django.apps import apps
from django.contrib.sites.models import Site
from django.core.management import call_command
from django.db import connection
from django.db.models.deletion import ProtectedError


# Project apps cleared on fallback (order: children first)
_CLEAR_APPS = (
    'analytics',
    'meetings',
    'tutor',
    'simulations',
    'content',
    'core',
    'users',
)


def _fallback_ordered_delete(stdout_write) -> None:
    """Delete rows app-by-app when flush fails (e.g. DB lock, partial migrate)."""
    stdout_write('  Using ordered DELETE fallback (schema preserved)...')
    models = []
    for app_label in _CLEAR_APPS:
        try:
            app_config = apps.get_app_config(app_label)
        except LookupError:
            continue
        for model in app_config.get_models():
            if model._meta.managed and not model._meta.proxy:
                models.append(model)

    for pass_num in range(1, 8):
        deleted_any = False
        for model in models:
            try:
                count, _ = model.objects.all().delete()
                if count:
                    deleted_any = True
            except ProtectedError:
                continue
        if not deleted_any:
            break
        stdout_write(f'  Delete pass {pass_num} complete.')

    # Django auth tables (except migrations)
    for label in ('account', 'socialaccount', 'authtoken', 'admin', 'auth', 'sessions'):
        try:
            app_config = apps.get_app_config(label)
        except LookupError:
            continue
        for model in app_config.get_models():
            if model._meta.managed and not model._meta.proxy:
                try:
                    model.objects.all().delete()
                except ProtectedError:
                    pass

    stdout_write('  Ordered delete finished.')


def clear_all_data(stdout_write) -> None:
    """
    Truncate all tables and reset sequences. Preserves migrations and table DDL.
    Falls back to ordered DELETE if flush fails (common when runserver holds DB locks).
    """
    stdout_write('Clearing all database rows (tables and schema preserved)...')
    if connection.vendor == 'postgresql':
        stdout_write(f'  Database: PostgreSQL ({connection.settings_dict.get("NAME", "?")})')
    elif connection.vendor == 'sqlite':
        stdout_write(f'  Database: SQLite ({connection.settings_dict.get("NAME", "?")})')
    else:
        stdout_write(f'  Database: {connection.vendor}')

    try:
        call_command('flush', verbosity=0, interactive=False)
        stdout_write('  flush() completed.')
    except Exception as exc:
        stdout_write(f'  flush() failed: {exc}')
        _fallback_ordered_delete(stdout_write)

    Site.objects.update_or_create(
        id=1,
        defaults={'domain': 'localhost:8000', 'name': 'SkyShield Edu'},
    )
    stdout_write('  Site id=1 restored.')
    stdout_write('  All rows cleared.')
