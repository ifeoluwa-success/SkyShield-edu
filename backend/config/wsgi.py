"""
WSGI config for the project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.2/howto/deployment/wsgi/
"""

import os

from django.core.exceptions import ImproperlyConfigured
from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

_ASGI_START = "daphne -b 0.0.0.0 -p $PORT config.asgi:application"

if os.getenv("RENDER", "").lower() in ("true", "1", "yes"):
    raise ImproperlyConfigured(
        "Gunicorn WSGI cannot run on Render for SkyShield (WebSockets need ASGI). "
        f"Render → Settings → Start Command → set exactly: {_ASGI_START} "
        "Then Manual Deploy. Do not use: gunicorn config.wsgi:application"
    )

application = get_wsgi_application()