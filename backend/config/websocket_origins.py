"""
WebSocket origin checks aligned with CORS (not ALLOWED_HOSTS).

Browsers send the *frontend* Origin (e.g. https://skyshieldedu.com) when connecting to
wss://skyshield-backend.onrender.com. AllowedHostsOriginValidator only permits origins
whose hostnames appear in ALLOWED_HOSTS (backend hostnames), which rejects production.
"""
from __future__ import annotations

import re
from urllib.parse import urlparse

from django.conf import settings


def _normalized_origin(url: str) -> str:
    parsed = urlparse(url.strip())
    if not parsed.scheme or not parsed.netloc:
        return ''
    return f'{parsed.scheme}://{parsed.netloc}'


def origin_allowed(origin: str | None) -> bool:
    if not origin:
        # Non-browser clients may omit Origin
        return True

    try:
        normalized = _normalized_origin(origin)
    except Exception:
        return False

    if not normalized:
        return False

    allowed = {_normalized_origin(o) for o in getattr(settings, 'CORS_ALLOWED_ORIGINS', []) if o}
    if normalized in allowed:
        return True

    for pattern in getattr(settings, 'CORS_ALLOWED_ORIGIN_REGEXES', []):
        try:
            if re.match(pattern, normalized):
                return True
        except re.error:
            continue

    hostname = urlparse(normalized).hostname or ''
    if hostname in settings.ALLOWED_HOSTS:
        return True

    return False


class WebSocketCorsOriginValidator:
    """ASGI middleware wrapping the WebSocket stack with CORS-style origin checks."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get('type') == 'websocket':
            origin = None
            for name, value in scope.get('headers', []):
                if name == b'origin':
                    origin = value.decode('latin1')
                    break
            if origin and not origin_allowed(origin):
                await send({'type': 'websocket.close', 'code': 4403})
                return
        return await self.app(scope, receive, send)
