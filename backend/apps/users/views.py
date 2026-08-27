# apps/users/views.py
from rest_framework import status, generics, permissions, viewsets, serializers
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from rest_framework_simplejwt.tokens import RefreshToken
from django.utils import timezone
from django.contrib.auth import authenticate
from django.db.models import Q
from django.template.loader import render_to_string
from django.conf import settings
from apps.core.utils import send_email_notification
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiResponse, OpenApiTypes
from allauth.socialaccount.providers.google.views import GoogleOAuth2Adapter
from allauth.socialaccount.providers.github.views import GitHubOAuth2Adapter
from allauth.socialaccount.providers.oauth2.client import OAuth2Client
from dj_rest_auth.registration.views import SocialLoginView

from .serializers import (
    UserRegistrationSerializer,
    UserLoginSerializer,
    UserProfileSerializer,
    ChangePasswordSerializer,
    ForgotPasswordSerializer,
    ResetPasswordSerializer,
    VerifyEmailSerializer,
    ResendVerificationSerializer,
    UserActivitySerializer,
    UserNotificationSerializer,
    UserDeviceSerializer,
    UserSessionSerializer,
    TwoFactorConfirmSerializer,
    TwoFactorVerifyLoginSerializer,
    TwoFactorDisableSerializer,
)
from .models import (
    UserSession,
    UserActivity,
    PasswordResetToken,
    EmailVerificationToken,
    UserNotification,
    UserDevice
)
from . import two_factor

import uuid
from datetime import timedelta
import logging

logger = logging.getLogger(__name__)


# ==============================================================================
# INLINE RESPONSE SERIALIZERS
# ==============================================================================

class RegisterResponseSerializer(serializers.Serializer):
    message = serializers.CharField()
    user = UserProfileSerializer()


class LoginResponseSerializer(serializers.Serializer):
    access = serializers.CharField(required=False)
    refresh = serializers.CharField(required=False)
    user = UserProfileSerializer(required=False)
    requires_2fa = serializers.BooleanField(required=False)
    temp_token = serializers.CharField(required=False)
    message = serializers.CharField(required=False)


class LogoutResponseSerializer(serializers.Serializer):
    message = serializers.CharField()


class LogoutRequestSerializer(serializers.Serializer):
    refresh = serializers.CharField(required=False, allow_blank=True)


class ChangePasswordResponseSerializer(serializers.Serializer):
    message = serializers.CharField()


class ForgotPasswordResponseSerializer(serializers.Serializer):
    message = serializers.CharField()


class ResetPasswordResponseSerializer(serializers.Serializer):
    message = serializers.CharField()


class VerifyEmailResponseSerializer(serializers.Serializer):
    message = serializers.CharField()


class ResendVerificationResponseSerializer(serializers.Serializer):
    message = serializers.CharField()


class TerminateSessionResponseSerializer(serializers.Serializer):
    message = serializers.CharField()


class TerminateSessionRequestSerializer(serializers.Serializer):
    session_id = serializers.UUIDField(required=False)


class TerminateOtherSessionsResponseSerializer(serializers.Serializer):
    message = serializers.CharField()


class TwoFactorSetupResponseSerializer(serializers.Serializer):
    secret = serializers.CharField()
    otpauth_url = serializers.CharField()
    qr_code = serializers.CharField()
    two_factor_enabled = serializers.BooleanField()


class TwoFactorConfirmResponseSerializer(serializers.Serializer):
    message = serializers.CharField()
    two_factor_enabled = serializers.BooleanField()
    backup_codes = serializers.ListField(child=serializers.CharField())


class TwoFactorDisableResponseSerializer(serializers.Serializer):
    message = serializers.CharField()
    two_factor_enabled = serializers.BooleanField()


def _complete_authenticated_login(request, user):
    """Issue JWTs and session records after password (and 2FA, if any) succeed."""
    user.reset_login_attempts()
    user.last_active = timezone.now()
    user.last_login_ip = request.META.get('REMOTE_ADDR')
    user.save(update_fields=['last_active', 'last_login_ip'])

    session = UserSession.objects.create(
        user=user,
        session_id=str(uuid.uuid4()),
        ip_address=request.META.get('REMOTE_ADDR') or '0.0.0.0',
        user_agent=request.META.get('HTTP_USER_AGENT', ''),
        device_info={
            'browser': request.META.get('HTTP_USER_AGENT', ''),
        }
    )

    UserActivity.objects.create(
        user=user,
        activity_type='login',
        ip_address=request.META.get('REMOTE_ADDR'),
        user_agent=request.META.get('HTTP_USER_AGENT', ''),
        metadata={'session_id': str(session.id)}
    )

    refresh = RefreshToken.for_user(user)
    return {
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'user': UserProfileSerializer(user).data,
    }


def _two_factor_challenge_response(user):
    return Response({
        'requires_2fa': True,
        'temp_token': two_factor.issue_pending_token(user),
        'message': 'Two-factor authentication required.',
    }, status=status.HTTP_200_OK)


# ==============================================================================
# SOCIAL AUTH VIEWS
# ==============================================================================

def _social_callback_url(provider: str) -> str:
    base = settings.FRONTEND_URL.rstrip('/')
    return f'{base}/auth/callback/{provider}'


def _resolve_social_callback_url(provider: str, request) -> str:
    """Use redirect_uri from the client when it matches an allowed callback URL."""
    default = _social_callback_url(provider)
    redirect_uri = None
    if hasattr(request, 'data') and isinstance(request.data, dict):
        redirect_uri = request.data.get('redirect_uri')
    if not redirect_uri:
        return default

    redirect_uri = str(redirect_uri).strip().rstrip('/')
    suffix = f'/auth/callback/{provider}'
    if not redirect_uri.endswith(suffix):
        return default

    allowed = {default}
    base = settings.FRONTEND_URL.rstrip('/')
    for origin in (base, 'http://localhost:5173', 'http://127.0.0.1:5173'):
        allowed.add(f'{origin.rstrip("/")}{suffix}')

    return redirect_uri if redirect_uri in allowed else default


def _finalize_social_user(user) -> None:
    updates = []
    if not user.email_verified:
        user.email_verified = True
        updates.append('email_verified')
    if user.status != 'active':
        user.status = 'active'
        updates.append('status')
    if updates:
        user.save(update_fields=updates)


class GoogleLogin(SocialLoginView):
    adapter_class = GoogleOAuth2Adapter
    client_class = OAuth2Client

    def post(self, request, *args, **kwargs):
        self.callback_url = _resolve_social_callback_url('google', request)
        return super().post(request, *args, **kwargs)

    def get_response(self):
        response = super().get_response()
        if response.status_code == 200:
            _finalize_social_user(self.user)
            if getattr(self.user, 'two_factor_enabled', False):
                return _two_factor_challenge_response(self.user)
            data = dict(response.data)
            data['user'] = UserProfileSerializer(self.user).data
            return Response(data, status=status.HTTP_200_OK)
        return response


class GitHubLogin(SocialLoginView):
    adapter_class = GitHubOAuth2Adapter
    client_class = OAuth2Client

    def post(self, request, *args, **kwargs):
        self.callback_url = _resolve_social_callback_url('github', request)
        return super().post(request, *args, **kwargs)

    def get_response(self):
        response = super().get_response()
        if response.status_code == 200:
            _finalize_social_user(self.user)
            if getattr(self.user, 'two_factor_enabled', False):
                return _two_factor_challenge_response(self.user)
            data = dict(response.data)
            data['user'] = UserProfileSerializer(self.user).data
            return Response(data, status=status.HTTP_200_OK)
        return response


# ==============================================================================
# API VIEWS
# ==============================================================================

class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    @extend_schema(
        request=UserRegistrationSerializer,
        responses={
            201: RegisterResponseSerializer,
            400: OpenApiResponse(description="Bad Request")
        },
        description="Register a new user account"
    )
    def post(self, request):
        serializer = UserRegistrationSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()

            # Create email verification token
            token = str(uuid.uuid4())
            EmailVerificationToken.objects.create(
                user=user,
                token=token,
                expires_at=timezone.now() + timedelta(hours=24)
            )

            logger.info(f"New user registered: {user.email}")

            # Send verification email asynchronously
            activate_url = f"{settings.FRONTEND_URL}/verify-email?token={token}"
            context = {
                'user': user,
                'activate_url': activate_url,
            }
            html_message = render_to_string('account/email/email_confirmation_message.html', context)
            send_email_notification(
                user.email,
                "Mission Authorization: Verify Email",
                f"Please verify your email address by visiting: {activate_url}",
                html_message=html_message
            )

            return Response({
                'message': 'Registration successful. Please verify your email.',
                'user': UserProfileSerializer(user).data
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LoginView(APIView):
    """
    POST /users/login/

    Accepts { identifier, password } where `identifier` is either a
    username or an email address.  Returns JWT access + refresh tokens
    together with the full user profile (including the `role` field that
    the frontend uses for role-based routing).

    Role routing (enforced on the frontend, but documented here):
      - trainee                        → /dashboard
      - supervisor | admin | instructor → /tutor/dashboard
    """
    permission_classes = [permissions.AllowAny]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    @extend_schema(
        request=UserLoginSerializer,
        responses={
            200: LoginResponseSerializer,
            401: OpenApiResponse(description="Unauthorized")
        },
        description="Login with username or email and password"
    )
    def post(self, request):
        serializer = UserLoginSerializer(
            data=request.data,
            context={'request': request}
        )
        if serializer.is_valid():
            user = serializer.validated_data['user']

            # Password is correct; reset lockout counter before the 2FA step.
            user.reset_login_attempts()

            if user.two_factor_enabled:
                logger.info(f"2FA challenge issued for: {user.email}")
                return _two_factor_challenge_response(user)

            response_data = _complete_authenticated_login(request, user)
            logger.info(f"User logged in: {user.email} (role={user.role})")
            return Response(response_data, status=status.HTTP_200_OK)

        # Serializer validation failed (wrong credentials, account locked, etc.)
        return Response(serializer.errors, status=status.HTTP_401_UNAUTHORIZED)


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    @extend_schema(
        request=LogoutRequestSerializer,
        responses={200: LogoutResponseSerializer},
        description="Logout user and blacklist refresh token"
    )
    def post(self, request):
        try:
            # End all active sessions for this user
            UserSession.objects.filter(
                user=request.user,
                is_active=True
            ).update(is_active=False, logout_time=timezone.now())

            # Audit log
            UserActivity.objects.create(
                user=request.user,
                activity_type='logout',
                ip_address=request.META.get('REMOTE_ADDR'),
                user_agent=request.META.get('HTTP_USER_AGENT', '')
            )

            # Blacklist the refresh token if provided
            try:
                refresh_token = request.data.get('refresh')
                if refresh_token:
                    token = RefreshToken(refresh_token)
                    token.blacklist()
            except Exception:
                pass

            logger.info(f"User logged out: {request.user.email}")
            return Response({"message": "Successfully logged out"}, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"Logout error: {str(e)}")
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class ProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = UserProfileSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_object(self):
        return self.request.user

    @extend_schema(
        request=UserProfileSerializer,
        responses={200: UserProfileSerializer},
        description="Update user profile"
    )
    def put(self, request, *args, **kwargs):
        return self.update(request, *args, **kwargs)

    @extend_schema(
        request=UserProfileSerializer,
        responses={200: UserProfileSerializer},
        description="Partially update user profile"
    )
    def patch(self, request, *args, **kwargs):
        return self.partial_update(request, *args, **kwargs)

    @extend_schema(
        responses={200: UserProfileSerializer},
        description="Get user profile"
    )
    def get(self, request, *args, **kwargs):
        return self.retrieve(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        user = self.get_object()
        serializer = self.get_serializer(user, data=request.data, partial=True)
        if serializer.is_valid():
            self.perform_update(serializer)

            UserActivity.objects.create(
                user=user,
                activity_type='profile_update',
                ip_address=request.META.get('REMOTE_ADDR'),
                user_agent=request.META.get('HTTP_USER_AGENT', '')
            )

            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    @extend_schema(
        request=ChangePasswordSerializer,
        responses={200: ChangePasswordResponseSerializer},
        description="Change user password"
    )
    def post(self, request):
        serializer = ChangePasswordSerializer(
            data=request.data,
            context={'request': request}
        )
        if serializer.is_valid():
            user = request.user
            user.set_password(serializer.validated_data['new_password'])
            user.password_changed_at = timezone.now()
            user.save()

            UserActivity.objects.create(
                user=user,
                activity_type='password_change',
                ip_address=request.META.get('REMOTE_ADDR'),
                user_agent=request.META.get('HTTP_USER_AGENT', '')
            )

            # Invalidate all sessions except the current one
            UserSession.objects.filter(user=user, is_active=True).exclude(
                session_id=request.session.session_key
            ).update(is_active=False, logout_time=timezone.now())

            logger.info(f"Password changed for user: {user.email}")
            return Response({"message": "Password changed successfully"})
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ForgotPasswordView(APIView):
    permission_classes = [permissions.AllowAny]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    @extend_schema(
        request=ForgotPasswordSerializer,
        responses={200: ForgotPasswordResponseSerializer},
        description="Request password reset email"
    )
    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.context.get('user')
            if user:
                token = str(uuid.uuid4())
                PasswordResetToken.objects.create(
                    user=user,
                    token=token,
                    expires_at=timezone.now() + timedelta(hours=1)
                )
                logger.info(f"Password reset requested for: {user.email}")

                # Send password reset email asynchronously
                password_reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
                context = {
                    'user': user,
                    'password_reset_url': password_reset_url,
                }
                html_message = render_to_string('account/email/password_reset_key_message.html', context)
                send_email_notification(
                    user.email,
                    "Access Recovery Protocol",
                    f"Reset your credentials by visiting: {password_reset_url}",
                    html_message=html_message
                )

            # Always return success to prevent email enumeration
            return Response({
                "message": "If an account exists with this email, you will receive a password reset link."
            })
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ResetPasswordView(APIView):
    permission_classes = [permissions.AllowAny]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    @extend_schema(
        request=ResetPasswordSerializer,
        responses={200: ResetPasswordResponseSerializer},
        description="Reset password using token"
    )
    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        if serializer.is_valid():
            reset_token = serializer.context['reset_token']
            user = reset_token.user

            user.set_password(serializer.validated_data['new_password'])
            user.password_changed_at = timezone.now()
            user.save()

            reset_token.is_used = True
            reset_token.used_at = timezone.now()
            reset_token.save()

            UserActivity.objects.create(
                user=user,
                activity_type='password_reset',
                ip_address=request.META.get('REMOTE_ADDR'),
                user_agent=request.META.get('HTTP_USER_AGENT', '')
            )

            UserSession.objects.filter(user=user, is_active=True).update(
                is_active=False,
                logout_time=timezone.now()
            )

            logger.info(f"Password reset successful for: {user.email}")
            return Response({"message": "Password reset successful"})
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class VerifyEmailView(APIView):
    permission_classes = [permissions.AllowAny]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    @extend_schema(
        request=VerifyEmailSerializer,
        responses={200: VerifyEmailResponseSerializer},
        description="Verify email using token"
    )
    def post(self, request):
        serializer = VerifyEmailSerializer(data=request.data)
        if serializer.is_valid():
            token = serializer.context['token']
            user = token.user

            user.email_verified = True
            user.status = 'active'
            user.save()

            token.verified_at = timezone.now()
            token.save()

            UserActivity.objects.create(
                user=user,
                activity_type='email_verify',
                ip_address=request.META.get('REMOTE_ADDR'),
                user_agent=request.META.get('HTTP_USER_AGENT', '')
            )

            logger.info(f"Email verified for: {user.email}")
            return Response({"message": "Email verified successfully"})
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ResendVerificationView(APIView):
    permission_classes = [permissions.AllowAny]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    @extend_schema(
        request=ResendVerificationSerializer,
        responses={200: ResendVerificationResponseSerializer},
        description="Resend email verification link"
    )
    def post(self, request):
        serializer = ResendVerificationSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.context.get('user')
            if user:
                token = str(uuid.uuid4())
                EmailVerificationToken.objects.create(
                    user=user,
                    token=token,
                    expires_at=timezone.now() + timedelta(hours=24)
                )
                logger.info(f"Verification email resent to: {user.email}")

                # Send verification email asynchronously
                activate_url = f"{settings.FRONTEND_URL}/verify-email?token={token}"
                context = {
                    'user': user,
                    'activate_url': activate_url,
                }
                html_message = render_to_string('account/email/email_confirmation_message.html', context)
                send_email_notification(
                    user.email,
                    "Mission Authorization: Verify Email",
                    f"Please verify your email address by visiting: {activate_url}",
                    html_message=html_message
                )

            return Response({
                "message": "If your email is unverified, you will receive a verification link."
            })
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class UserActivityView(generics.ListAPIView):
    serializer_class = UserActivitySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return UserActivity.objects.none()
        return UserActivity.objects.filter(user=self.request.user)

    @extend_schema(
        parameters=[
            OpenApiParameter('limit', OpenApiTypes.INT,
                              description='Number of activities to return'),
            OpenApiParameter('activity_type', OpenApiTypes.STR,
                              description='Filter by activity type'),
        ],
        responses={200: UserActivitySerializer(many=True)},
        description="Get user activity history"
    )
    def get(self, request, *args, **kwargs):
        queryset = self.get_queryset()

        activity_type = self.request.query_params.get('activity_type')
        if activity_type:
            queryset = queryset.filter(activity_type=activity_type)

        limit = self.request.query_params.get('limit', 50)
        try:
            limit = int(limit)
        except (ValueError, TypeError):
            limit = 50

        queryset = queryset.order_by('-timestamp')[:limit]
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


class UserNotificationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = UserNotificationSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return UserNotification.objects.none()
        return UserNotification.objects.filter(user=self.request.user)

    @extend_schema(
        description="Mark notification as read",
        responses={200: OpenApiResponse(
            description="Notification marked as read"
        )}
    )
    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        notification.is_read = True
        notification.save()
        return Response({"message": "Notification marked as read"})

    @extend_schema(
        description="Mark all notifications as read",
        responses={200: OpenApiResponse(
            description="All notifications marked as read"
        )}
    )
    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        self.get_queryset().filter(is_read=False).update(is_read=True)
        return Response({"message": "All notifications marked as read"})


class UserDeviceViewSet(viewsets.ModelViewSet):
    serializer_class = UserDeviceSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return UserDevice.objects.none()
        return UserDevice.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @extend_schema(
        description="Trust a device",
        responses={200: OpenApiResponse(
            description="Device trusted"
        )}
    )
    @action(detail=True, methods=['post'])
    def trust(self, request, pk=None):
        device = self.get_object()
        device.is_trusted = True
        device.save()
        return Response({"message": "Device trusted"})

    @extend_schema(
        description="Untrust a device",
        responses={200: OpenApiResponse(
            description="Device untrusted"
        )}
    )
    @action(detail=True, methods=['post'])
    def untrust(self, request, pk=None):
        device = self.get_object()
        device.is_trusted = False
        device.save()
        return Response({"message": "Device untrusted"})


class UserSessionsViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = UserSessionSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return UserSession.objects.none()
        return UserSession.objects.filter(user=self.request.user).order_by('-login_time')

    @extend_schema(
        description="Terminate a specific session",
        responses={200: OpenApiResponse(
            description="Session terminated"
        )}
    )
    @action(detail=True, methods=['post'], url_path='terminate')
    def terminate_session(self, request, pk=None):
        try:
            session = self.get_queryset().get(id=pk)
            session.is_active = False
            session.logout_time = timezone.now()
            session.save()
            return Response({"message": "Session terminated"})
        except UserSession.DoesNotExist:
            return Response({"error": "Session not found"}, status=status.HTTP_404_NOT_FOUND)

    @extend_schema(
        description="Terminate all other sessions",
        responses={200: OpenApiResponse(
            description="All other sessions terminated"
        )}
    )
    @action(detail=False, methods=['post'])
    def terminate_others(self, request):
        current_session_id = request.session.session_key
        self.get_queryset().filter(
            is_active=True
        ).exclude(
            session_id=current_session_id
        ).update(is_active=False, logout_time=timezone.now())
        return Response({"message": "All other sessions terminated"})


class UserSessionsListView(generics.ListAPIView):
    serializer_class = UserSessionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return UserSession.objects.none()
        return UserSession.objects.filter(user=self.request.user).order_by('-login_time')


class TerminateSessionView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    @extend_schema(
        request=None,
        responses={200: TerminateSessionResponseSerializer},
        description="Terminate a specific session"
    )
    def post(self, request, session_id):
        try:
            session = UserSession.objects.get(id=session_id, user=request.user)
            session.is_active = False
            session.logout_time = timezone.now()
            session.save()
            return Response({"message": "Session terminated"})
        except UserSession.DoesNotExist:
            return Response({"error": "Session not found"}, status=status.HTTP_404_NOT_FOUND)


class TerminateOtherSessionsView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    @extend_schema(
        request=None,
        responses={200: TerminateOtherSessionsResponseSerializer},
        description="Terminate all other sessions"
    )
    def post(self, request):
        current_session_id = request.session.session_key
        UserSession.objects.filter(
            user=request.user,
            is_active=True
        ).exclude(
            session_id=current_session_id
        ).update(is_active=False, logout_time=timezone.now())
        # ↑ Fixed: was `Respons>` (typo) — now `return Response(...)`
        return Response({"message": "All other sessions terminated"})


class TwoFactorSetupView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    @extend_schema(
        request=None,
        responses={
            200: TwoFactorSetupResponseSerializer,
            400: OpenApiResponse(description="2FA already enabled"),
        },
        description="Start TOTP enrollment. Returns a secret and QR code; 2FA is not enabled until confirm."
    )
    def post(self, request):
        user = request.user
        if user.two_factor_enabled:
            return Response(
                {"detail": "Two-factor authentication is already enabled."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        secret = two_factor.generate_totp_secret()
        user.two_factor_secret = secret
        user.two_factor_enabled = False
        user.save(update_fields=['two_factor_secret', 'two_factor_enabled'])

        otpauth_url = two_factor.provisioning_uri(secret, user.email)
        logger.info(f"2FA setup initiated for: {user.email}")
        return Response({
            "secret": secret,
            "otpauth_url": otpauth_url,
            "qr_code": two_factor.qr_data_uri(otpauth_url),
            "two_factor_enabled": False,
        })


class TwoFactorConfirmView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    @extend_schema(
        request=TwoFactorConfirmSerializer,
        responses={
            200: TwoFactorConfirmResponseSerializer,
            400: OpenApiResponse(description="Invalid OTP or setup not started"),
        },
        description="Confirm TOTP enrollment with a valid authenticator code."
    )
    def post(self, request):
        serializer = TwoFactorConfirmSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        if user.two_factor_enabled:
            return Response(
                {"detail": "Two-factor authentication is already enabled."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not user.two_factor_secret:
            return Response(
                {"detail": "Two-factor setup has not been started."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        otp = serializer.validated_data['otp']
        if not two_factor.verify_totp(user.two_factor_secret, otp):
            return Response(
                {"otp": ["Invalid verification code."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.two_factor_enabled = True
        user.save(update_fields=['two_factor_enabled'])
        backup_codes = two_factor.generate_backup_codes(user)

        UserActivity.objects.create(
            user=user,
            activity_type='two_factor_enabled',
            ip_address=request.META.get('REMOTE_ADDR'),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
        )
        logger.info(f"2FA enabled for: {user.email}")
        return Response({
            "message": "Two-factor authentication enabled.",
            "two_factor_enabled": True,
            "backup_codes": backup_codes,
        })


class TwoFactorVerifyLoginView(APIView):
    permission_classes = [permissions.AllowAny]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    @extend_schema(
        request=TwoFactorVerifyLoginSerializer,
        responses={
            200: LoginResponseSerializer,
            400: OpenApiResponse(description="Invalid OTP"),
            401: OpenApiResponse(description="Invalid or expired pending token"),
        },
        description="Complete login by verifying a TOTP or backup code after password authentication."
    )
    def post(self, request):
        serializer = TwoFactorVerifyLoginSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = two_factor.user_from_pending_token(serializer.validated_data['temp_token'])
        except ValueError:
            return Response(
                {"detail": "Invalid or expired two-factor token."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if not user.two_factor_enabled:
            return Response(
                {"detail": "Two-factor authentication is not enabled for this account."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not two_factor.verify_second_factor(user, serializer.validated_data['otp']):
            return Response(
                {"otp": ["Invalid verification code."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        response_data = _complete_authenticated_login(request, user)
        logger.info(f"User logged in with 2FA: {user.email} (role={user.role})")
        return Response(response_data, status=status.HTTP_200_OK)


class TwoFactorDisableView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    @extend_schema(
        request=TwoFactorDisableSerializer,
        responses={
            200: TwoFactorDisableResponseSerializer,
            400: OpenApiResponse(description="Invalid password or OTP"),
        },
        description="Disable 2FA after verifying the current password and a valid OTP or backup code."
    )
    def post(self, request):
        serializer = TwoFactorDisableSerializer(
            data=request.data,
            context={'request': request},
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        if not user.two_factor_enabled:
            return Response(
                {"detail": "Two-factor authentication is not enabled."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not two_factor.verify_second_factor(user, serializer.validated_data['otp']):
            return Response(
                {"otp": ["Invalid verification code."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        two_factor.clear_two_factor(user)
        UserActivity.objects.create(
            user=user,
            activity_type='two_factor_disabled',
            ip_address=request.META.get('REMOTE_ADDR'),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
        )
        logger.info(f"2FA disabled for: {user.email}")
        return Response({
            "message": "Two-factor authentication disabled.",
            "two_factor_enabled": False,
        })