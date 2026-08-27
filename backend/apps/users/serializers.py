# apps/users/serializers.py
from rest_framework import serializers
from django.contrib.auth import authenticate
from django.utils import timezone
from django.db.models import Q
from drf_spectacular.utils import extend_schema_field
from .models import (
    User, UserActivity, PasswordResetToken, EmailVerificationToken,
    UserNotification, UserDevice, UserSession
)
import re


class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True, style={'input_type': 'password'})
    password2 = serializers.CharField(write_only=True, required=True, style={'input_type': 'password'})
    company = serializers.CharField(source='organization', required=False, allow_blank=True)
    role = serializers.CharField(source='job_title', required=False, allow_blank=True)

    class Meta:
        model = User
        fields = [
            'email', 'username', 'password', 'password2',
            'first_name', 'last_name', 'company', 'role'
        ]
        extra_kwargs = {
            'first_name': {'required': False, 'allow_blank': True},
            'last_name': {'required': False, 'allow_blank': True},
            'username': {'required': True}
        }

    def validate(self, data):
        if data['password'] != data['password2']:
            raise serializers.ValidationError({"password": "Passwords do not match"})

        password = data['password']
        if len(password) < 8:
            raise serializers.ValidationError({"password": "Password must be at least 8 characters"})
        if not re.search(r'[A-Z]', password):
            raise serializers.ValidationError({"password": "Password must contain at least one uppercase letter"})
        if not re.search(r'[a-z]', password):
            raise serializers.ValidationError({"password": "Password must contain at least one lowercase letter"})
        if not re.search(r'[0-9]', password):
            raise serializers.ValidationError({"password": "Password must contain at least one number"})

        if not re.match(r"[^@]+@[^@]+\.[^@]+", data['email']):
            raise serializers.ValidationError({"email": "Invalid email format"})

        return data

    def create(self, validated_data):
        validated_data.pop('password2')
        user = User.objects.create_user(**validated_data)
        user.status = 'pending'
        user.save()

        UserActivity.objects.create(
            user=user,
            activity_type='registration',
            metadata={'method': 'registration'}
        )

        return user


class UserLoginSerializer(serializers.Serializer):
    """
    Accepts either a username or an email address in the `identifier` field,
    paired with a `password`.

    Resolution order:
      1. If `identifier` looks like an email (contains '@'), look up by email.
      2. Otherwise look up by username.
      3. If not found by either primary heuristic, try the other field as a
         fallback so that users who have an email-like username still work.
    """

    identifier = serializers.CharField(
        required=True,
        help_text="Your username or email address"
    )
    password = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'}
    )

    def _resolve_user(self, identifier: str) -> 'User | None':
        """
        Find the User record that matches `identifier` (username or email).
        Returns None if no match exists.
        """
        # Try an exact match on both email and username in one query.
        # Q() lets Django build a single SELECT with an OR clause.
        try:
            return User.objects.get(
                Q(email__iexact=identifier) | Q(username__iexact=identifier)
            )
        except User.DoesNotExist:
            return None
        except User.MultipleObjectsReturned:
            # Extremely unlikely but possible if data integrity was violated.
            # Fall back to email-first preference.
            return User.objects.filter(email__iexact=identifier).first()

    def validate(self, data):
        identifier = data.get('identifier', '').strip()
        password = data.get('password', '')

        # Step 1: resolve the User record
        user_obj = self._resolve_user(identifier)

        if user_obj is None:
            raise serializers.ValidationError("Invalid username/email or password.")

        # Step 2: verify the password via Django's authenticate()
        # authenticate() requires the USERNAME_FIELD which is 'email' on our model.
        user = authenticate(
            request=self.context.get('request'),
            email=user_obj.email,
            password=password
        )

        if not user:
            # Increment failed-attempt counter on the resolved user
            user_obj.increment_login_attempts()
            raise serializers.ValidationError("Invalid username/email or password.")

        # Step 3: gate checks
        if not user.is_active:
            raise serializers.ValidationError("Account is disabled.")

        if user.account_locked_until and user.account_locked_until > timezone.now():
            raise serializers.ValidationError(
                "Account is temporarily locked due to too many failed login attempts. "
                "Please try again later."
            )

        if user.status == 'suspended':
            raise serializers.ValidationError("Account has been suspended.")

        if not user.email_verified:
            raise serializers.ValidationError(
                "Email not verified. Please verify your email first."
            )

        data['user'] = user
        return data


class UserProfileSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    can_create_meeting = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'email', 'username', 'first_name', 'last_name', 'full_name',
            'role', 'status', 'organization', 'department', 'job_title',
            'profile_picture', 'phone_number', 'bio', 'date_of_birth', 'address',
            'training_level', 'total_score', 'simulations_completed',
            'average_response_time', 'accuracy_rate', 'certifications',
            'email_verified', 'email_notifications', 'two_factor_enabled',
            'created_at', 'last_active', 'can_create_meeting'
        ]
        # Server-controlled identity, training, and security fields are
        # readable on the profile but never writable via PATCH/PUT.
        read_only_fields = [
            'id', 'email', 'role', 'status', 'created_at', 'last_active',
            'training_level', 'total_score', 'simulations_completed',
            'average_response_time', 'accuracy_rate', 'certifications',
            'email_verified', 'two_factor_enabled',
        ]

    @extend_schema_field(serializers.CharField())
    def get_full_name(self, obj):
        return obj.get_full_name()

    @extend_schema_field(serializers.BooleanField())
    def get_can_create_meeting(self, obj):
        return obj.can_create_meeting()

    def update(self, instance, validated_data):
        # Defense in depth: never persist server-controlled fields even if a
        # caller bypasses read_only_fields (e.g. extra kwargs / extra fields).
        for field in (
            'email', 'role', 'status', 'is_staff', 'is_superuser', 'is_active',
            'training_level', 'total_score', 'simulations_completed',
            'average_response_time', 'accuracy_rate', 'certifications',
            'weak_areas', 'strong_areas', 'email_verified',
            'two_factor_enabled', 'two_factor_secret',
            'login_attempts', 'account_locked_until', 'password_changed_at',
            'email_verification_token', 'last_login_ip',
        ):
            validated_data.pop(field, None)
        return super().update(instance, validated_data)


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=True, write_only=True, style={'input_type': 'password'})
    new_password = serializers.CharField(required=True, write_only=True, style={'input_type': 'password'})
    new_password2 = serializers.CharField(required=True, write_only=True, style={'input_type': 'password'})

    def validate(self, data):
        if data['new_password'] != data['new_password2']:
            raise serializers.ValidationError({"new_password": "Passwords do not match"})

        password = data['new_password']
        if len(password) < 8:
            raise serializers.ValidationError({"new_password": "Password must be at least 8 characters"})
        if not re.search(r'[A-Z]', password):
            raise serializers.ValidationError({"new_password": "Password must contain at least one uppercase letter"})
        if not re.search(r'[a-z]', password):
            raise serializers.ValidationError({"new_password": "Password must contain at least one lowercase letter"})
        if not re.search(r'[0-9]', password):
            raise serializers.ValidationError({"new_password": "Password must contain at least one number"})

        return data

    def validate_old_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError("Old password is incorrect")
        return value


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)

    def validate_email(self, value):
        try:
            user = User.objects.get(email=value, is_active=True)
            self.context['user'] = user
        except User.DoesNotExist:
            pass
        return value


class ResetPasswordSerializer(serializers.Serializer):
    token = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True, write_only=True, style={'input_type': 'password'})
    new_password2 = serializers.CharField(required=True, write_only=True, style={'input_type': 'password'})

    def validate(self, data):
        if data['new_password'] != data['new_password2']:
            raise serializers.ValidationError({"new_password": "Passwords do not match"})

        password = data['new_password']
        if len(password) < 8:
            raise serializers.ValidationError({"new_password": "Password must be at least 8 characters"})

        try:
            reset_token = PasswordResetToken.objects.get(
                token=data['token'],
                is_used=False,
                expires_at__gt=timezone.now()
            )
            self.context['reset_token'] = reset_token
        except PasswordResetToken.DoesNotExist:
            raise serializers.ValidationError({"token": "Invalid or expired token"})

        return data


class VerifyEmailSerializer(serializers.Serializer):
    token = serializers.CharField(required=True)

    def validate_token(self, value):
        try:
            token = EmailVerificationToken.objects.get(
                token=value,
                verified_at__isnull=True,
                expires_at__gt=timezone.now()
            )
            self.context['token'] = token
        except EmailVerificationToken.DoesNotExist:
            raise serializers.ValidationError("Invalid or expired token")
        return value


class ResendVerificationSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)

    def validate_email(self, value):
        try:
            user = User.objects.get(email=value, is_active=True, email_verified=False)
            self.context['user'] = user
        except User.DoesNotExist:
            pass
        return value


class UserActivitySerializer(serializers.ModelSerializer):
    class Meta:
        model = UserActivity
        fields = ['id', 'activity_type', 'metadata', 'ip_address', 'timestamp']
        read_only_fields = ['id', 'timestamp']


class UserNotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserNotification
        fields = ['id', 'type', 'title', 'message', 'link', 'is_read', 'metadata', 'created_at']
        read_only_fields = ['id', 'created_at']


class UserDeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserDevice
        fields = ['id', 'device_id', 'device_name', 'device_type', 'last_used', 'is_trusted', 'created_at']
        read_only_fields = ['id', 'last_used', 'created_at']


class UserSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserSession
        fields = [
            'id', 'session_id', 'ip_address', 'device_info', 'location',
            'login_time', 'last_activity', 'is_active', 'is_mobile'
        ]
        read_only_fields = ['id', 'login_time', 'last_activity']


class TokenResponseSerializer(serializers.Serializer):
    access = serializers.CharField()
    refresh = serializers.CharField()
    user = UserProfileSerializer()


class TwoFactorConfirmSerializer(serializers.Serializer):
    otp = serializers.CharField(required=True, max_length=16)


class TwoFactorVerifyLoginSerializer(serializers.Serializer):
    temp_token = serializers.CharField(required=True)
    otp = serializers.CharField(required=True, max_length=16)


class TwoFactorDisableSerializer(serializers.Serializer):
    password = serializers.CharField(
        required=True, write_only=True, style={'input_type': 'password'}
    )
    otp = serializers.CharField(required=True, max_length=16)

    def validate_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError('Password is incorrect.')
        return value