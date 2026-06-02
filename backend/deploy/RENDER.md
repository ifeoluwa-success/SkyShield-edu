# Deploying SkyShield backend on Render (WebSockets / meetings)

Meeting rooms use **Django Channels** over WebSockets (`/ws/meeting/...`). That only works when the service runs an **ASGI** process, not plain Gunicorn WSGI.

## Required: start command (you still have Gunicorn if logs show `503` on `/ws/mission/`)

1. Open [Render Dashboard](https://dashboard.render.com) → **skyshield-backend** (Web Service, not Postgres/Redis).
2. **Settings** → scroll to **Start Command**.
3. Clear the field completely. Paste **only** this (no `gunicorn`, no `config.wsgi`):

```bash
daphne -b 0.0.0.0 -p $PORT config.asgi:application
```

4. **Save Changes**.
5. **Manual Deploy** → **Deploy latest commit** (saving settings alone does not restart with a new command).

Do **not** use:

```bash
gunicorn config.wsgi:application
```

After the next deploy with WSGI still configured, the app may **fail to boot** on purpose (clear error in deploy logs). That is expected until you switch to Daphne.

Gunicorn serves HTTP only.

| Log | Meaning |
|-----|---------|
| `404` on `/ws/mission/...` | Old deploy — WSGI, no fallback route |
| **`503` on `/ws/mission/...`** | **Current deploy — still Gunicorn**; change Start Command to Daphne |
| WebSocket **101** in browser | Daphne is running correctly |

`render.yaml` in the repo does **not** update an existing service automatically. You must paste the start command in the Render **dashboard** and redeploy.

After switching to Daphne, `GET https://skyshield-backend.onrender.com/api/core/health/` should include `"websockets": true`.

## SECRET_KEY (JWT warning)

If logs show `InsecureKeyLengthWarning: The HMAC key is 7 bytes long`, your Render `SECRET_KEY` is too short. Set a new value (50+ characters), e.g. generate locally:

```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

Paste into Render → Environment → `SECRET_KEY`, save, redeploy. All users will need to sign in again.

Alternatively, apply the blueprint in `backend/render.yaml` when creating the service.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `ALLOWED_HOSTS` | `skyshield-backend.onrender.com` (comma-separated if more) |
| `FRONTEND_URL` | Exact frontend origin, e.g. `https://www.skyshieldedu.com` (added to CORS) |
| `REDIS_URL` | **Recommended** for Channels (Render Redis). Without it, meetings use in-memory layer (single instance only). |
| `SECRET_KEY`, `DATABASE_URL` | Standard Django |

## Frontend build

Set at build time (HTTPS API → frontend automatically uses **wss://** for `/ws/...`):

```
VITE_API_URL=https://skyshield-backend.onrender.com/api
```

Optional explicit socket base — **must include the hostname** (do not set `VITE_WS_URL=wss://` alone; that produces a broken URL):

```
VITE_WS_URL=wss://skyshield-backend.onrender.com
```

If `VITE_API_URL` is set correctly, you do not need `VITE_WS_URL` at all.

**Local dev:** The app may show `ws://localhost:5173/ws/...` in DevTools. That is correct — Vite proxies `/ws` to the backend. Production builds must never use `ws://` against Render.

## Origin validation

WebSocket `Origin` is validated against **CORS** origins (`config/websocket_origins.py`), not only `ALLOWED_HOSTS`. Ensure your deployed frontend URL is in `CORS_ALLOWED_ORIGINS` or matches `CORS_ALLOWED_ORIGIN_REGEXES` (e.g. `*.onrender.com`), or set `FRONTEND_URL`.

## Verify after deploy

1. Service logs should show Daphne listening on `$PORT`.
2. Open a meeting in production; DevTools → Network → WS should show status **101 Switching Protocols**.
3. If you see **403** on the WS handshake, check `FRONTEND_URL` / CORS list matches the site you open in the browser.
