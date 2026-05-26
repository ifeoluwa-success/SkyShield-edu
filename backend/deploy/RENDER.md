# Deploying SkyShield backend on Render (WebSockets / meetings)

Meeting rooms use **Django Channels** over WebSockets (`/ws/meeting/...`). That only works when the service runs an **ASGI** process, not plain Gunicorn WSGI.

## Required: start command

In **Render → your web service → Settings → Start Command**, set:

```bash
daphne -b 0.0.0.0 -p $PORT config.asgi:application
```

Do **not** use:

```bash
gunicorn config.wsgi:application
```

Gunicorn serves HTTP only; the browser will show `WebSocket connection to wss://... failed` with no useful body.

Alternatively, apply the blueprint in `backend/render.yaml` when creating the service.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `ALLOWED_HOSTS` | `skyshield-backend.onrender.com` (comma-separated if more) |
| `FRONTEND_URL` | Full frontend origin, e.g. `https://skyshieldedu.com` (added to CORS) |
| `REDIS_URL` | **Recommended** for Channels (Render Redis). Without it, meetings use in-memory layer (single instance only). |
| `SECRET_KEY`, `DATABASE_URL` | Standard Django |

## Frontend build

Set at build time (HTTPS API → frontend automatically uses **wss://** for `/ws/...`):

```
VITE_API_URL=https://skyshield-backend.onrender.com/api
```

Optional explicit socket base (must use `wss://` in production, not `ws://`):

```
VITE_WS_URL=wss://skyshield-backend.onrender.com
```

**Local dev:** The app may show `ws://localhost:5173/ws/...` in DevTools. That is correct — Vite proxies `/ws` to the backend. Production builds must never use `ws://` against Render.

## Origin validation

WebSocket `Origin` is validated against **CORS** origins (`config/websocket_origins.py`), not only `ALLOWED_HOSTS`. Ensure your deployed frontend URL is in `CORS_ALLOWED_ORIGINS` or matches `CORS_ALLOWED_ORIGIN_REGEXES` (e.g. `*.onrender.com`), or set `FRONTEND_URL`.

## Verify after deploy

1. Service logs should show Daphne listening on `$PORT`.
2. Open a meeting in production; DevTools → Network → WS should show status **101 Switching Protocols**.
3. If you see **403** on the WS handshake, check `FRONTEND_URL` / CORS list matches the site you open in the browser.
