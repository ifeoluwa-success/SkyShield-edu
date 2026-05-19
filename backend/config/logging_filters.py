"""Logging filters for development and production noise control."""
from __future__ import annotations

import logging

from apps.simulations.ws_support import log_client_disconnect


class AsyncioCancelledNoiseFilter(logging.Filter):
    """
    Suppress asyncio ERROR spam when Daphne cancels in-flight HTTP work after
    the browser aborts or navigates away (shielded sync views in thread pool).
    """

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
        except Exception:
            return True
        if 'CancelledError' in message and 'shielded future' in message:
            return False
        return True


class BrokenPipeNoiseFilter(logging.Filter):
    """
    Suppress raw WSGI 'Broken pipe from (...)' lines from django.server.

    Those are almost always benign client aborts (tab close, navigation, aborted
    fetch). Structured context is logged by ClientDisconnectLogMiddleware when
    the disconnect is visible during response close.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
        except Exception:
            return True
        if 'Broken pipe' in message or 'Connection reset by peer' in message:
            peer = '-'
            if "('" in message:
                peer = message.split('(', 1)[-1].rstrip(')').strip("'")
            log_client_disconnect(
                channel='http-wsgi',
                peer=peer,
                detail=message,
            )
            return False
        return True
