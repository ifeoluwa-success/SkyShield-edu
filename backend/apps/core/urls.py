from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from . import admin_portal

router = DefaultRouter()
router.register(r'notifications', views.NotificationViewSet, basename='notification')
router.register(r'settings', views.SystemSettingViewSet, basename='setting')
router.register(r'audit-logs', views.AuditLogViewSet, basename='audit-log')
router.register(r'error-logs', views.ErrorLogViewSet, basename='error-log')
router.register(r'api-logs', views.APILogViewSet, basename='api-log')

urlpatterns = [
    path('', include(router.urls)),
    path('upload/', views.FileUploadView.as_view(), name='file-upload'),
    path('health/', views.HealthCheckView.as_view(), name='health-check'),
    path('admin/stats/', views.DashboardStatsView.as_view(), name='admin-stats'),
    # Admin portal (frontend dashboards)
    path('admin/users/', admin_portal.AdminAllUsersView.as_view(), name='admin-users'),
    path(
        'admin/users/<uuid:pk>/status/',
        admin_portal.AdminUserStatusUpdateView.as_view(),
        name='admin-user-status',
    ),
    path('admin/supervisors/', admin_portal.AdminSupervisorsView.as_view(), name='admin-supervisors'),
    path('admin/instructors/', admin_portal.AdminInstructorsView.as_view(), name='admin-instructors'),
    path('admin/admins/', admin_portal.AdminAdminsView.as_view(), name='admin-admins'),
    path('admin/tutors/', admin_portal.AdminTutorsView.as_view(), name='admin-tutors'),
    path('admin/courses/', admin_portal.AdminAllCoursesView.as_view(), name='admin-courses'),
    path(
        'admin/schedule/sessions/',
        admin_portal.AdminScheduleSessionsView.as_view(),
        name='admin-schedule-sessions',
    ),
    path(
        'admin/schedule/meetings/',
        admin_portal.AdminScheduleMeetingsView.as_view(),
        name='admin-schedule-meetings',
    ),
    path('admin/logs/audit/', admin_portal.AdminAuditLogsView.as_view(), name='admin-logs-audit'),
    path('admin/logs/errors/', admin_portal.AdminErrorLogsView.as_view(), name='admin-logs-errors'),
    path('admin/logs/api/', admin_portal.AdminApiLogsView.as_view(), name='admin-logs-api'),
    path('admin/metrics/charts/', admin_portal.AdminChartMetricsView.as_view(), name='admin-chart-metrics'),
]