from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from . import views

router = DefaultRouter()
router.register(r'notifications', views.UserNotificationViewSet, basename='notification')
router.register(r'devices', views.UserDeviceViewSet, basename='device')
router.register(r'sessions', views.UserSessionsViewSet, basename='session')

urlpatterns = [
    # Authentication
    path('register/', views.RegisterView.as_view(), name='register'),
    path('login/', views.LoginView.as_view(), name='login'),
    path('logout/', views.LogoutView.as_view(), name='logout'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # Social Authentication
    path('google/', views.GoogleLogin.as_view(), name='google_login'),
    path('github/', views.GitHubLogin.as_view(), name='github_login'),
    
    # Profile
    path('profile/', views.ProfileView.as_view(), name='profile'),
    path('change-password/', views.ChangePasswordView.as_view(), name='change-password'),

    # Two-factor authentication
    path('2fa/setup/', views.TwoFactorSetupView.as_view(), name='two-factor-setup'),
    path('2fa/confirm/', views.TwoFactorConfirmView.as_view(), name='two-factor-confirm'),
    path('2fa/verify-login/', views.TwoFactorVerifyLoginView.as_view(), name='two-factor-verify-login'),
    path('2fa/disable/', views.TwoFactorDisableView.as_view(), name='two-factor-disable'),
    
    # Password Reset
    path('forgot-password/', views.ForgotPasswordView.as_view(), name='forgot-password'),
    path('reset-password/', views.ResetPasswordView.as_view(), name='reset-password'),
    
    # Email Verification
    path('verify-email/', views.VerifyEmailView.as_view(), name='verify-email'),
    path('resend-verification/', views.ResendVerificationView.as_view(), name='resend-verification'),
    
    # User Activity
    path('activities/', views.UserActivityView.as_view(), name='activities'),
    
    # Legacy session endpoints (kept for backward compatibility)
    path('sessions/list/', views.UserSessionsListView.as_view(), name='sessions-list'),
    path('sessions/<uuid:session_id>/terminate/', views.TerminateSessionView.as_view(), name='terminate-session'),
    path('sessions/terminate-others/', views.TerminateOtherSessionsView.as_view(), name='terminate-others'),
    
    # Router URLs (includes sessions, notifications, devices via ViewSets)
    path('', include(router.urls)),
]