"""Channel layer / Redis health helpers for mission WebSockets."""
from __future__ import annotations

import logging

from channels.db import database_sync_to_async
from channels.layers import get_channel_layer

from .ws_support import channel_safe

logger = logging.getLogger(__name__)


def mission_group_send(group: str, message: dict) -> None:
    """group_send with msgpack-safe payload (UUID/datetime from DRF, etc.)."""
    from asgiref.sync import async_to_sync

    layer = get_channel_layer()
    if layer is None:
        return
    async_to_sync(layer.group_send)(group, channel_safe(message))


def redis_ping() -> bool:
    """Return True if the default Redis cache backend responds to PING."""
    try:
        from django.core.cache import cache

        cache.set('mission_ws_health', '1', timeout=5)
        return cache.get('mission_ws_health') == '1'
    except Exception as exc:
        logger.warning('mission.redis_ping_failed: %s', exc)
        return False


def channel_layer_available() -> bool:
    """True when a channel layer is configured (does not guarantee Redis is up)."""
    try:
        return get_channel_layer() is not None
    except Exception:
        return False


async def ensure_channel_layer(*, ping_redis: bool = False):
    """
    Verify channel layer is configured before group operations.

    Redis PING is optional (ping_redis=True) — on connect we skip it so a slow
    cache round-trip does not block accept/connection_confirmed.
    """
    if not channel_layer_available():
        raise RuntimeError('Channel layer not configured')
    if ping_redis:
        ok = await database_sync_to_async(redis_ping)()
        if not ok:
            raise RuntimeError('Redis unreachable for channel layer')
