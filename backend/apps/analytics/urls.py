from django.urls import path
from . import views
from .platform_views import (
    PlatformCertificationAnalyticsView,
    PlatformOverviewView,
    PlatformPerformanceTrendsView,
    PlatformRetryAnalyticsView,
    PlatformUserAnalyticsView,
)

urlpatterns = [
    path('dashboard/', views.DashboardStatsView.as_view(), name='dashboard'),
    path('performance/', views.PerformanceView.as_view(), name='performance'),
    path('trends/', views.PerformanceTrendsView.as_view(), name='trends'),
    path('skills/', views.SkillAssessmentsView.as_view(), name='skills'),
    path('learning-path/', views.LearningPathView.as_view(), name='learning-path'),
    path('comparison/', views.ComparisonView.as_view(), name='comparison'),
    # Platform-wide (admin / supervisor / instructor)
    path('platform/overview/', PlatformOverviewView.as_view(), name='platform-overview'),
    path('platform/users/', PlatformUserAnalyticsView.as_view(), name='platform-users'),
    path('platform/performance-trends/', PlatformPerformanceTrendsView.as_view(), name='platform-performance-trends'),
    path('platform/certifications/', PlatformCertificationAnalyticsView.as_view(), name='platform-certifications'),
    path('platform/retries/', PlatformRetryAnalyticsView.as_view(), name='platform-retries'),
]