"""
Redis / Channels configuration tuned for Upstash and other serverless Redis hosts.

Upstash closes idle TCP connections; channels_redis long-lived pub/sub reads need
keepalives, health checks, and no aggressive socket read timeout.
"""
from __future__ import annotations

import os
import ssl
from urllib.parse import urlparse, urlunparse


def normalize_redis_url(url: str) -> str:
    """Ensure TLS for Upstash; strip query params we apply via client kwargs."""
    parsed = urlparse(url.strip())
    if not parsed.hostname:
        return url

    scheme = parsed.scheme
    if "upstash.io" in parsed.hostname and scheme == "redis":
        scheme = "rediss"

    # Rebuild without query — options are passed explicitly to redis-py
    return urlunparse(
        (scheme, parsed.netloc, parsed.path or "/0", "", "", "")
    )


def redis_cache_options(url: str) -> dict:
    """django-redis OPTIONS for cache (short timeouts, tolerate failures)."""
    parsed = urlparse(url)
    opts: dict = {
        "CLIENT_CLASS": "django_redis.client.DefaultClient",
        "IGNORE_EXCEPTIONS": True,
        "SOCKET_CONNECT_TIMEOUT": int(os.getenv("REDIS_CONNECT_TIMEOUT", "10")),
        "SOCKET_TIMEOUT": int(os.getenv("REDIS_SOCKET_TIMEOUT", "10")),
        "RETRY_ON_TIMEOUT": True,
        "HEALTH_CHECK_INTERVAL": int(os.getenv("REDIS_HEALTH_CHECK_INTERVAL", "25")),
    }
    if parsed.scheme == "rediss" or (
        parsed.hostname and "upstash.io" in parsed.hostname
    ):
        opts["CONNECTION_POOL_KWARGS"] = {
            "ssl_cert_reqs": ssl.CERT_NONE,
            "ssl_check_hostname": False,
        }
    return opts


def channel_layer_host_config(url: str) -> dict:
    """
    channels_redis host entry — passed through to redis-py ConnectionPool.

    socket_timeout=None avoids TimeoutError on blocking pub/sub reads (Channels).
    """
    normalized = normalize_redis_url(url)
    parsed = urlparse(normalized)

    host: dict = {
        "address": normalized,
        "socket_connect_timeout": int(os.getenv("REDIS_CONNECT_TIMEOUT", "15")),
        # None = no read timeout on listener (required for group_receive loop)
        "socket_timeout": None,
        "retry_on_timeout": True,
        "health_check_interval": int(os.getenv("REDIS_HEALTH_CHECK_INTERVAL", "25")),
        "socket_keepalive": True,
    }

    if parsed.scheme == "rediss" or (
        parsed.hostname and "upstash.io" in parsed.hostname
    ):
        host["ssl"] = True
        host["ssl_cert_reqs"] = ssl.CERT_NONE

    return host


def redis_channel_layer_config(
    redis_url: str,
    *,
    secret_key: str | None,
    capacity: int = 1500,
    expiry: int = 60,
) -> dict:
    return {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {
                "hosts": [channel_layer_host_config(redis_url)],
                "capacity": capacity,
                "expiry": expiry,
                "symmetric_encryption_keys": [secret_key] if secret_key else [],
            },
        },
    }


def redis_startup_ping(redis_url: str) -> bool:
    """Quick connectivity check for CHANNEL_LAYER=auto."""
    try:
        import redis

        normalized = normalize_redis_url(redis_url)
        parsed = urlparse(normalized)
        kwargs: dict = {
            "socket_connect_timeout": int(os.getenv("REDIS_CONNECT_TIMEOUT", "15")),
            "socket_timeout": int(os.getenv("REDIS_SOCKET_TIMEOUT", "10")),
            "retry_on_timeout": True,
        }
        if parsed.scheme == "rediss" or (
            parsed.hostname and "upstash.io" in parsed.hostname
        ):
            kwargs["ssl_cert_reqs"] = ssl.CERT_NONE
            kwargs["ssl_check_hostname"] = False

        client = redis.from_url(normalized, **kwargs)
        client.ping()
        client.close()
        return True
    except Exception:
        return False
