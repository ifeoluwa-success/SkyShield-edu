from django.conf import settings
from django.core.checks import Warning, register


@register()
def check_daphne_for_websockets(app_configs, **kwargs):
    if "channels" not in settings.INSTALLED_APPS:
        return []
    if "daphne" in settings.INSTALLED_APPS:
        return []
    return [
        Warning(
            "channels is installed but daphne is not available in this Python "
            "environment. `manage.py runserver` will be HTTP-only and "
            "/ws/* will return 404. Install daphne in the active venv "
            "(pip install -r requirements.txt) or run: "
            "daphne -b 127.0.0.1 -p 8000 config.asgi:application",
            id="core.W001",
        )
    ]
