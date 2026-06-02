#!/usr/bin/env bash
# Render / production: Channels WebSockets need ASGI (Daphne), not Gunicorn WSGI.
set -euo pipefail
cd "$(dirname "$0")"
exec daphne -b 0.0.0.0 -p "${PORT:-8000}" config.asgi:application
