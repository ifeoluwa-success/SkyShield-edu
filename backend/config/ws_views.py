"""HTTP fallback when /ws/* is hit on WSGI (Gunicorn) instead of ASGI (Daphne)."""

from django.http import JsonResponse

_ASGI_START = "daphne -b 0.0.0.0 -p $PORT config.asgi:application"


def websocket_wsgi_fallback(request):
    return JsonResponse(
        {
            "detail": (
                "WebSocket routes (/ws/meeting/, /ws/mission/) require an ASGI server. "
                f"On Render, set Start Command to: {_ASGI_START}"
            ),
            "code": "websocket_requires_asgi",
            "start_command": _ASGI_START,
        },
        status=503,
    )
