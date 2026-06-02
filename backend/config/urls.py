from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import RedirectView
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView

from config.ws_views import websocket_wsgi_fallback

urlpatterns = [
    # Only reached under WSGI (Gunicorn). Daphne routes /ws/* via config.asgi.
    re_path(r"^ws/.*$", websocket_wsgi_fallback),
    # Admin
    path("admin/", admin.site.urls),

    # ========================
    # API URLs
    # ========================
    path("api/auth/", include("dj_rest_auth.urls")),
    path("api/auth/registration/", include("dj_rest_auth.registration.urls")),
    path("api/auth/social/", include("allauth.socialaccount.urls")),
    path("api/users/", include("apps.users.urls")),
    path("api/content/", include("apps.content.urls")),
    path("api/tutor/", include("apps.tutor.urls")),
    path("api/simulations/", include("apps.simulations.urls")),
    path("api/analytics/", include("apps.analytics.urls")),
    path("api/core/", include("apps.core.urls")),
    path("api/meetings/", include("apps.meetings.urls")),

    # ========================
    # API Documentation with drf-spectacular
    # ========================
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/schema/swagger-ui/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/schema/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),

    # ========================
    # Root Redirect
    # ========================
    path("", RedirectView.as_view(url="/api/schema/swagger-ui/", permanent=False)),
]

# ========================
# Static & Media (DEBUG only)
# ========================
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)