from pathlib import Path
import importlib.util
import os
from datetime import timedelta
from urllib.parse import urlparse

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# Render sets RENDER=true; never load local .env there (avoids DEBUG=True leaking to prod).
_ON_RENDER = os.getenv("RENDER", "").lower() in ("true", "1", "yes")
if not _ON_RENDER:
    load_dotenv(BASE_DIR / ".env", override=False)

SECRET_KEY = os.getenv("SECRET_KEY")
DEBUG = os.getenv("DEBUG", "False").lower() in ("true", "1", "yes")

if _ON_RENDER:
    from django.core.exceptions import ImproperlyConfigured

    if not SECRET_KEY or len(SECRET_KEY) < 50:
        raise ImproperlyConfigured(
            "SECRET_KEY on Render must be at least 50 random characters. "
            "In Render → Environment, set SECRET_KEY (Generate or: "
            "python -c \"import secrets; print(secrets.token_urlsafe(64))\")."
        )
if _ON_RENDER and DEBUG:
    import warnings

    warnings.warn(
        "DEBUG=True on Render exposes settings and stack traces. Set DEBUG=False in the Render dashboard.",
        stacklevel=1,
    )
# testserver: required for Django/DRF APIClient and some integration tests
def _parse_host_list(env_value: str) -> list[str]:
    return [h.strip() for h in env_value.split(",") if h.strip()]


_ALLOWED_HOSTS_BASE = _parse_host_list(
    os.getenv(
        "ALLOWED_HOSTS",
        "localhost,127.0.0.1,testserver,skyshield-backend.onrender.com",
    )
)


ALLOWED_HOSTS = list(dict.fromkeys(_ALLOWED_HOSTS_BASE))

# Application definition
_INSTALLED_APPS = [
    # Custom apps (order matters - users first)
    "apps.users",
    "apps.core",
    "apps.content",
    "apps.tutor",
    "apps.simulations",
    "apps.analytics",
    "apps.meetings",  # Meetings app
    
    # Third-party apps
    "rest_framework",
    "rest_framework.authtoken",
    "rest_framework_simplejwt",
    "dj_rest_auth",
    "dj_rest_auth.registration",
    "allauth",
    "allauth.account",
    "allauth.socialaccount",
    "allauth.socialaccount.providers.google",
    "allauth.socialaccount.providers.github",
    "corsheaders",
    "drf_spectacular",
    "drf_spectacular_sidecar",
    "anymail",
    "channels",
    "channels_redis",
    "django_extensions",
    "django_celery_results",
    
    # Django built-in apps
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.sites",
]

# Daphne must be first when installed — otherwise `runserver` is WSGI-only and /ws/* returns 404.
if importlib.util.find_spec("daphne") is not None:
    INSTALLED_APPS = ["daphne", *_INSTALLED_APPS]
else:
    INSTALLED_APPS = list(_INSTALLED_APPS)

SITE_ID = 1

AUTHENTICATION_BACKENDS = [
    'django.contrib.auth.backends.ModelBackend',
    'allauth.account.auth_backends.AuthenticationBackend',
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "config.middleware.ClientDisconnectLogMiddleware",
    "config.middleware.ApiUnauthorizedLogMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "allauth.account.middleware.AccountMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# Database
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("DB_NAME"),
        "USER": os.getenv("DB_USER"),
        "PASSWORD": os.getenv("DB_PASSWORD"),
        "HOST": os.getenv("DB_HOST", "127.0.0.1"),
        "PORT": os.getenv("DB_PORT", "5432"),
    }
}

# Redis Cache & Channel Layers
from config.redis_channels import (
    normalize_redis_url,
    redis_cache_options,
    redis_channel_layer_config,
    redis_startup_ping,
)

REDIS_URL = normalize_redis_url(os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0"))

CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": REDIS_URL,
        "OPTIONS": redis_cache_options(REDIS_URL),
    }
}


def _memory_channel_layer():
    return {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}


def _redis_channel_layer():
    return redis_channel_layer_config(REDIS_URL, secret_key=SECRET_KEY)


_channel_mode = os.getenv("CHANNEL_LAYER", "auto").lower()
if _channel_mode in ("memory", "inmemory"):
    CHANNEL_LAYERS = _memory_channel_layer()
elif _channel_mode == "redis":
    CHANNEL_LAYERS = _redis_channel_layer()
else:
    CHANNEL_LAYERS = (
        _redis_channel_layer()
        if redis_startup_ping(REDIS_URL)
        else _memory_channel_layer()
    )

# Immersive mission WebSocket keepalive (application-level JSON ping)
MISSION_WS_PING_INTERVAL_SECONDS = int(os.getenv("MISSION_WS_PING_INTERVAL_SECONDS", "25"))

# Celery Configuration
CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = 'django-db'
CELERY_CACHE_BACKEND = 'django-cache'
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = "UTC"
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 30 * 60  # 30 minutes
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True
CELERY_REDIS_BACKEND_USE_SSL = REDIS_URL.startswith("rediss://")
CELERY_BROKER_USE_SSL = CELERY_REDIS_BACKEND_USE_SSL

# Meeting/WebRTC Settings
MEETING_SETTINGS = {
    'MAX_PARTICIPANTS_PER_MEETING': 50,
    'MAX_MEETING_DURATION_HOURS': 4,
    'ALLOW_RECORDING': True,
    'ALLOW_SCREEN_SHARE': True,
    'ALLOW_CHAT': True,
    'ENABLE_WAITING_ROOM': True,
    'AUTO_RECORDING': False,
    'MEETING_CODE_LENGTH': 10,
    'INVITATION_EXPIRY_DAYS': 7,
}

ICE_SERVERS = [
    {'urls': 'stun:stun.l.google.com:19302'},
    {'urls': 'stun:stun1.l.google.com:19302'},
    {'urls': 'stun:stun2.l.google.com:19302'},
    {'urls': 'stun:stun3.l.google.com:19302'},
    {'urls': 'stun:stun4.l.google.com:19302'},
]

# Free TURN servers for reliable WebRTC connectivity (development only)
TURN_SERVERS = [
    {
        'urls': 'turn:openrelay.metered.ca:80',
        'username': 'openrelayproject',
        'credential': 'openrelayproject',
    },
    {
        'urls': 'turn:openrelay.metered.ca:443',
        'username': 'openrelayproject',
        'credential': 'openrelayproject',
    },
    {
        'urls': 'turn:openrelay.metered.ca:443?transport=tcp',
        'username': 'openrelayproject',
        'credential': 'openrelayproject',
    },
]

MEETING_RECORDING_STORAGE = {
    'STORAGE_BACKEND': 'django.core.files.storage.FileSystemStorage',
    'STORAGE_PATH': 'meeting_recordings/',
    'ALLOWED_EXTENSIONS': ['.webm', '.mp4'],
    'MAX_FILE_SIZE': 1024 * 1024 * 500,
}

# Auth validators
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Internationalization
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# Static files
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "static"]

# Media files
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Custom user model
AUTH_USER_MODEL = "users.User"

# Email Configuration
EMAIL_BACKEND = os.getenv('EMAIL_BACKEND', 'anymail.backends.sendgrid.EmailBackend')
ANYMAIL = {
    "SENDGRID_API_KEY": os.getenv("SENDGRID_API_KEY"),
}
DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL', 'SkyShield <noreply@skyshieldedu.com>')
SUPPORT_EMAIL = os.getenv('SUPPORT_EMAIL', 'support@skyshieldedu.com')
FRONTEND_URL = os.getenv('FRONTEND_URL', 'https://www.skyshieldedu.com')

# Genie / Gemini API (DeepMind scenario generation)
GENIE_API_KEY = os.environ.get('GENIE_API_KEY', '')
GENIE_ENABLED = os.environ.get('GENIE_ENABLED', 'false').lower() == 'true'

# dj-rest-auth settings
REST_AUTH = {
    'USE_JWT': True,
    'JWT_AUTH_COOKIE': 'jwt-auth',
    'JWT_AUTH_REFRESH_COOKIE': 'jwt-refresh-token',
    'JWT_AUTH_HTTPONLY': False,
    'USER_DETAILS_SERIALIZER': 'apps.users.serializers.UserProfileSerializer',
}

# allauth settings
ACCOUNT_USER_MODEL_USERNAME_FIELD = 'username'
ACCOUNT_LOGIN_METHODS = {'email'}
ACCOUNT_SIGNUP_FIELDS = ['email*', 'password1*', 'password2*']
ACCOUNT_EMAIL_VERIFICATION = 'mandatory'
ACCOUNT_CONFIRM_EMAIL_ON_GET = True
SOCIALACCOUNT_EMAIL_VERIFICATION = 'none'
SOCIALACCOUNT_ADAPTER = 'apps.users.adapters.SkyShieldSocialAccountAdapter'
SOCIALACCOUNT_QUERY_EMAIL = True

SOCIALACCOUNT_PROVIDERS = {
    'google': {
        'SCOPE': ['profile', 'email'],
        'AUTH_PARAMS': {'access_type': 'online'},
        'APP': {
            'client_id': os.getenv('SOCIAL_AUTH_GOOGLE_CLIENT_ID'),
            'secret': os.getenv('SOCIAL_AUTH_GOOGLE_SECRET'),
            'key': ''
        }
    },
    'github': {
        'SCOPE': ['user:email'],
        'APP': {
            'client_id': os.getenv('SOCIAL_AUTH_GITHUB_CLIENT_ID'),
            'secret': os.getenv('SOCIAL_AUTH_GITHUB_SECRET'),
            'key': ''
        }
    }
}

# REST Framework settings
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    'DEFAULT_RENDERER_CLASSES': (
        'rest_framework.renderers.JSONRenderer',
    ),
    'DEFAULT_PARSER_CLASSES': (
        'rest_framework.parsers.JSONParser',
        'rest_framework.parsers.FormParser',
        'rest_framework.parsers.MultiPartParser',
    ),
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
}

# JWT settings
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=60),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=1),
    "ROTATE_REFRESH_TOKENS": False,
    "BLACKLIST_AFTER_ROTATION": False,
    "UPDATE_LAST_LOGIN": False,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": SECRET_KEY,
    "VERIFYING_KEY": "",
    "AUDIENCE": None,
    "ISSUER": None,
    "JSON_ENCODER": None,
    "JWK_URL": None,
    "LEEWAY": 0,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "AUTH_HEADER_NAME": "HTTP_AUTHORIZATION",
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
    "USER_AUTHENTICATION_RULE": "rest_framework_simplejwt.authentication.default_user_authentication_rule",
    "AUTH_TOKEN_CLASSES": ("rest_framework_simplejwt.tokens.AccessToken",),
    "TOKEN_TYPE_CLAIM": "token_type",
    "TOKEN_USER_CLASS": "rest_framework_simplejwt.models.TokenUser",
    "JTI_CLAIM": "jti",
}

# CORS settings
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://skyshieldedu.com",
    "https://www.skyshieldedu.com",
]

# Allow the actual deployed frontend URL set in the environment (Render/Vercel etc.)
_frontend_url = os.getenv("FRONTEND_URL", "").rstrip("/")
if _frontend_url and _frontend_url not in CORS_ALLOWED_ORIGINS:
    CORS_ALLOWED_ORIGINS.append(_frontend_url)

# Also allow preview/branch deployment URLs from common platforms
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^https://([\w-]+\.)?skyshieldedu\.com$",
    r"^https://[\w-]+\.onrender\.com$",
    r"^https://[\w-]+\.vercel\.app$",
    r"^https://[\w-]+\.netlify\.app$",
]

CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [
    "accept",
    "authorization",
    "content-type",
    "origin",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
]

# Allow frontend hostnames in ALLOWED_HOSTS (useful for proxies and host checks)
for _origin in CORS_ALLOWED_ORIGINS:
    _host = urlparse(_origin).hostname
    if _host and _host not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(_host)

# Security settings for production
if not DEBUG:
    # Render/nginx terminate TLS and forward HTTP with X-Forwarded-Proto.
    # Without this, SECURE_SSL_REDIRECT 301s every API call; browsers see CORS errors
    # because redirect responses lack Access-Control-Allow-Origin.
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    USE_X_FORWARDED_HOST = True

    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = 'DENY'
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True

# Logging configuration
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'filters': {
        'broken_pipe_noise': {
            '()': 'config.logging_filters.BrokenPipeNoiseFilter',
        },
        'asyncio_cancelled_noise': {
            '()': 'config.logging_filters.AsyncioCancelledNoiseFilter',
        },
    },
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
        'simple': {
            'format': '{levelname} {message}',
            'style': '{',
        },
        'api': {
            'format': '{asctime} {message}',
            'style': '{',
        }
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
            'filters': ['asyncio_cancelled_noise'],
        },
        'api_console': {
            'class': 'logging.StreamHandler',
            'formatter': 'api',
            'filters': ['broken_pipe_noise'],
        },
        'file': {
            'class': 'logging.FileHandler',
            'filename': BASE_DIR / 'logs' / 'django.log',
            'formatter': 'verbose',
        },
        'api_file': {
            'class': 'logging.FileHandler',
            'filename': BASE_DIR / 'logs' / 'api.log',
            'formatter': 'api',
        },
        'websocket_file': {
            'class': 'logging.FileHandler',
            'filename': BASE_DIR / 'logs' / 'websocket.log',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': os.getenv('DJANGO_LOG_LEVEL', 'INFO'),
            'propagate': False,
        },
        'django.server': {
            'handlers': ['api_console'],
            'level': 'INFO',
            'propagate': False,
        },
        'apps': {
            'handlers': ['console', 'file'],
            'level': 'DEBUG',
            'propagate': False,
        },
        'apps.meetings': {
            'handlers': ['console', 'file', 'websocket_file'],
            'level': 'DEBUG',
            'propagate': False,
        },
        'channels': {
            'handlers': ['console', 'websocket_file'],
            'level': 'DEBUG',
            'propagate': False,
        },
        'mail': {
            'handlers': ['console'],
            'level': 'DEBUG',
            'propagate': False,
        },
    },
}

# ==============================================================================
# BEAUTIFUL SWAGGER UI WITH CUSTOM HEADER
# ==============================================================================

SPECTACULAR_SETTINGS = {
    'TITLE': 'SkyShield Edu API',
    'DESCRIPTION': '''
SkyShield Educational Platform API - Your gateway to cybersecurity training.

## 🔐 Authentication
All endpoints (except login/register) require JWT Bearer token authentication.
Click the Authorize button and enter: `Bearer <your_token>`
    ''',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
    'SWAGGER_UI_DIST': 'SIDECAR',
    'SWAGGER_UI_FAVICON_HREF': 'SIDECAR',
    'REDOC_DIST': 'SIDECAR',
    'COMPONENT_SPLIT_REQUEST': True,
    'SCHEMA_PATH_PREFIX': '/api/',
    'AUTHENTICATION_WHITELIST': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    
    # 🌈 SIMPLE BUT BEAUTIFUL UI SETTINGS
    'SWAGGER_UI_SETTINGS': {
        'deepLinking': True,
        'persistAuthorization': True,
        'displayOperationId': False,
        'displayRequestDuration': True,
        'filter': True,
        'tryItOutEnabled': True,
        'syntaxHighlight': {
            'theme': 'monokai'
        },
        'docExpansion': 'list',
        'defaultModelsExpandDepth': -1,
    },
    
    # 🎨 CUSTOM HEADER STYLING (This makes the header beautiful!)
    'SWAGGER_UI_STATIC': {
        'customStyle': '''
            .topbar-wrapper { 
                background: linear-gradient(135deg, #07070a 0%, #131318 100%);
                padding: 15px 20px;
                border-radius: 8px;
                margin-bottom: 20px;
                border-bottom: 2px solid #fbbf24;
            }
            .topbar-wrapper a {
                color: #fbbf24 !important;
                font-size: 1.5em;
                font-weight: 800;
                text-decoration: none;
                letter-spacing: 2px;
            }
            .topbar-wrapper span {
                color: #fbbf24 !important;
            }
            .info { 
                background: linear-gradient(135deg, #0c0c10 0%, #131318 100%);
                padding: 20px;
                border-radius: 12px;
                border-left: 4px solid #fbbf24;
                color: #f4f4f5;
            }
            .info h1 { 
                color: #f4f4f5;
                font-size: 2.2em;
                margin-bottom: 10px;
            }
            .info .description { 
                color: #a1a1aa;
                font-size: 1.1em;
                line-height: 1.6;
            }
            .scheme-container {
                background: #1a1a21;
                border-radius: 8px;
                padding: 15px;
                margin: 20px 0;
                color: #f4f4f5;
            }
            .btn.authorize {
                background-color: #fbbf24 !important;
                border-color: #fbbf24 !important;
                color: #07070a !important;
                transition: all 0.3s ease;
                font-weight: bold;
            }
            .btn.authorize:hover {
                background-color: #d97706 !important;
                transform: translateY(-2px);
                box-shadow: 0 4px 15px rgba(251, 191, 36, 0.3);
            }
            .opblock-tag {
                font-size: 1.3em;
                font-weight: 600;
                color: #333;
                border-bottom: 2px solid #667eea;
                padding-bottom: 10px;
                margin-top: 20px;
            }
            .opblock {
                border-radius: 8px !important;
                margin: 10px 0 !important;
                box-shadow: 0 2px 4px rgba(0,0,0,0.05) !important;
                transition: all 0.3s ease !important;
            }
            .opblock:hover {
                box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important;
                transform: translateY(-2px);
            }
            .opblock-summary {
                padding: 12px 15px !important;
            }
            .opblock-summary-method {
                border-radius: 4px !important;
                font-weight: 600 !important;
                padding: 6px 12px !important;
            }
            .opblock-summary-path {
                font-weight: 600 !important;
                color: #333 !important;
            }
            .response-col_status {
                font-weight: 600 !important;
            }
            .model-box {
                background: #f8f9fa !important;
                border-radius: 8px !important;
                padding: 15px !important;
            }
        ''',
    },
    
    # 🔧 ENUM BEHAVIOR
    'ENUM_ADD_EXPLICIT_BLANK_NULL_CHOICE': False,
    'ENUM_GENERATE_CHOICE_DESCRIPTION': True,
    
    # 🔗 ENUM NAME OVERRIDES
    'ENUM_NAME_OVERRIDES': {
        'DifficultyEnum': [
            'apps.content.models.LearningMaterial.DIFFICULTY_CHOICES',
            'apps.content.models.LearningPath.DIFFICULTY_CHOICES',
            'apps.tutor.models.TeachingMaterial.DIFFICULTY_LEVELS',
            'apps.simulations.models.Scenario.DIFFICULTY_LEVELS',
        ],
        'LearningMaterialMaterialTypeEnum': 'apps.content.models.LearningMaterial.MATERIAL_TYPE_CHOICES',
        'PathEnrollmentStatusEnum': 'apps.content.models.PathEnrollment.STATUS_CHOICES',
        'TeachingMaterialMaterialTypeEnum': 'apps.tutor.models.TeachingMaterial.MATERIAL_TYPES',
        'TeachingSessionTypeEnum': 'apps.tutor.models.TeachingSession.SESSION_TYPES',
        'NotificationTypeEnum': 'apps.core.models.Notification.NOTIFICATION_TYPES',
        'FileTypeEnum': 'apps.core.models.FileUpload.FILE_TYPES',
        'ErrorLevelEnum': 'apps.core.models.ErrorLog.ERROR_LEVELS',
        'AuditActionEnum': 'apps.core.models.AuditLog.ACTION_TYPES',
        'MeetingStatusEnum': 'apps.meetings.models.Meeting.MEETING_STATUS',
        'ParticipantStatusEnum': 'apps.meetings.models.MeetingParticipant.PARTICIPANT_STATUS',
        'SimulationSessionStatusEnum': 'apps.simulations.models.SimulationSession.STATUS_CHOICES',
        'DecisionTypeEnum': 'apps.simulations.models.UserDecision.DECISION_TYPES',
        'UserActivityTypeEnum': 'apps.users.models.UserActivity.ACTIVITY_TYPES',
        'DeviceTypeEnum': 'apps.users.models.UserDevice.DEVICE_TYPES',
        'FeedbackRatingEnum': 'apps.simulations.models.ScenarioFeedback.RATINGS',
    },
}