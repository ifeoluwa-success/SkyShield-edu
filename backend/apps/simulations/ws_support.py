"""
WebSocket / long-poll helpers for immersive mission channels.

Broken-pipe notes (dev runserver logs):
- Most "Broken pipe from ('127.0.0.1', PORT)" lines are **HTTP** clients closing
  before Django finishes the response (tab close, aborted fetch, CORS preflight
  without follow-up POST). They are not always the mission WebSocket.
- OPTIONS /actions/ without POST is a browser CORS preflight; if the user
  navigates away or the frontend aborts, no POST is sent — unrelated to WS idle.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, time
from decimal import Decimal
from enum import Enum
from typing import Any, Optional
from uuid import UUID

logger = logging.getLogger(__name__)

# errno: EPIPE, ECONNRESET (Linux), WSAECONNRESET (Windows)
_CLIENT_GONE_ERRNOS = frozenset({32, 54, 104, 10054})


def is_client_disconnect(exc: BaseException) -> bool:
    """True when the remote endpoint closed or reset the connection."""
    if isinstance(exc, asyncio.CancelledError):
        return True
    if isinstance(exc, (BrokenPipeError, ConnectionResetError, ConnectionAbortedError)):
        return True
    if isinstance(exc, OSError) and getattr(exc, 'errno', None) in _CLIENT_GONE_ERRNOS:
        return True
    name = type(exc).__name__
    return name in ('ClientDisconnect', 'WebSocketDisconnect', 'ConnectionClosedError')


def log_client_disconnect(
    *,
    channel: str,
    exc: Optional[BaseException] = None,
    run_id: Optional[str] = None,
    participant_id: Optional[str] = None,
    user_id: Optional[str] = None,
    peer: Optional[str] = None,
    detail: Optional[str] = None,
) -> None:
    """Structured WARNING for abandoned TCP/WS connections (not ERROR)."""
    logger.warning(
        'mission.client_disconnect channel=%s run_id=%s participant_id=%s '
        'user_id=%s peer=%s detail=%s exc=%s',
        channel,
        run_id or '-',
        participant_id or '-',
        user_id or '-',
        peer or '-',
        detail or '-',
        repr(exc) if exc else '-',
    )


def peer_from_scope(scope: dict) -> Optional[str]:
    client = scope.get('client')
    if client and len(client) >= 2:
        return f'{client[0]}:{client[1]}'
    return None


def channel_safe(value: Any) -> Any:
    """
    Recursively coerce values for channels_redis (msgpack) group_send payloads.
    DRF .data and Django UUID PKs are not msgpack-serializable as-is.
    """
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, Enum):
        return channel_safe(value.value)
    if isinstance(value, dict):
        return {str(k): channel_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [channel_safe(v) for v in value]
    if isinstance(value, bytes):
        return value.decode('utf-8', errors='replace')
    return str(value)


def run_id_from_http_path(path: str) -> Optional[str]:
    """Extract incident run UUID from /api/simulations/incidents/<id>/..."""
    parts = [p for p in (path or '').split('/') if p]
    try:
        idx = parts.index('incidents')
        if idx + 1 < len(parts):
            return parts[idx + 1]
    except ValueError:
        pass
    return None
