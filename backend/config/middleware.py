"""
HTTP middleware — log client disconnects (broken pipe) with request context.
"""
from __future__ import annotations

import asyncio

from django.http import HttpResponse

from apps.simulations.ws_support import (
    is_client_disconnect,
    log_client_disconnect,
    run_id_from_http_path,
)


def _http_disconnect_response(request, exc) -> HttpResponse:
    """Log client abort and return 204 (avoids runserver 'Unknown Status Code' on 499)."""
    path = getattr(request, 'path', '') or ''
    log_client_disconnect(
        channel='http',
        exc=exc,
        run_id=run_id_from_http_path(path),
        user_id=(
            str(request.user.pk)
            if getattr(request, 'user', None) and request.user.is_authenticated
            else None
        ),
        peer=request.META.get('REMOTE_ADDR'),
        detail=f'{getattr(request, "method", "?")} {path}',
    )
    return HttpResponse(status=204)


class ApiUnauthorizedLogMiddleware:
    """Clarify 401 logs: missing Authorization header vs invalid/expired JWT."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if (
            response.status_code == 401
            and request.path.startswith('/api/')
            and not request.path.startswith('/api/users/login')
        ):
            import logging

            logger = logging.getLogger('config.auth')
            if request.META.get('HTTP_AUTHORIZATION'):
                logger.info('API 401 (token present): %s %s', request.method, request.path)
            else:
                logger.info('API 401 (no Authorization header): %s %s', request.method, request.path)
        return response


def _handle_disconnect(exc: BaseException) -> bool:
    if isinstance(exc, (KeyboardInterrupt, SystemExit)):
        return False
    return is_client_disconnect(exc)


class ClientDisconnectLogMiddleware:
    """
    Catch client-aborted HTTP responses and log at WARNING with run_id when present.
    Does not affect WebSocket traffic (handled in MissionConsumer).

    Under Daphne/ASGI, disconnects often surface as asyncio.CancelledError (a
    BaseException), not BrokenPipeError — so we catch BaseException here and
    implement __acall__ for the async stack.
    """

    def __init__(self, get_response):
        self.get_response = get_response
        self.async_mode = asyncio.iscoroutinefunction(get_response)

    def __call__(self, request):
        try:
            response = self.get_response(request)
        except BaseException as exc:
            if _handle_disconnect(exc):
                return _http_disconnect_response(request, exc)
            raise

        if hasattr(response, 'close'):
            original_close = response.close

            def close():
                try:
                    original_close()
                except BaseException as exc:
                    if _handle_disconnect(exc):
                        _http_disconnect_response(request, exc)
                    else:
                        raise

            response.close = close

        return response

    async def __acall__(self, request):
        try:
            response = await self.get_response(request)
        except BaseException as exc:
            if _handle_disconnect(exc):
                return _http_disconnect_response(request, exc)
            raise

        if hasattr(response, 'close'):
            original_close = response.close

            async def aclose():
                try:
                    if asyncio.iscoroutinefunction(original_close):
                        await original_close()
                    else:
                        original_close()
                except BaseException as exc:
                    if _handle_disconnect(exc):
                        _http_disconnect_response(request, exc)
                    else:
                        raise

            response.close = aclose

        return response
