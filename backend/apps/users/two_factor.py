"""TOTP helpers for SkyShield two-factor authentication.

Uses the existing User.two_factor_secret / TwoFactorBackupCode models and
the pyotp + qrcode packages already declared in requirements.txt.

Pending login tokens use a dedicated JWT token_type so they cannot be used
as session access tokens.
"""
from __future__ import annotations

import base64
import logging
import secrets
from datetime import timedelta
from io import BytesIO

import pyotp
import qrcode
from django.utils import timezone
from qrcode.image.pil import PilImage
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.tokens import Token

from .models import TwoFactorBackupCode, User

logger = logging.getLogger(__name__)

ISSUER_NAME = 'SkyShield Edu'
TOTP_VALID_WINDOW = 1
PENDING_TOKEN_LIFETIME = timedelta(minutes=5)
BACKUP_CODE_COUNT = 8


class TwoFactorPendingToken(Token):
    """Short-lived token proving password auth succeeded; not a session JWT."""

    token_type = '2fa_pending'
    lifetime = PENDING_TOKEN_LIFETIME


def generate_totp_secret() -> str:
    return pyotp.random_base32()


def provisioning_uri(secret: str, email: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=ISSUER_NAME)


def qr_data_uri(otpauth_url: str) -> str:
    qr = qrcode.QRCode(box_size=6, border=2)
    qr.add_data(otpauth_url)
    qr.make(fit=True)
    image = qr.make_image(image_factory=PilImage, fill_color='black', back_color='white')
    buffer = BytesIO()
    image.save(buffer, format='PNG')
    encoded = base64.b64encode(buffer.getvalue()).decode('ascii')
    return f'data:image/png;base64,{encoded}'


def _normalize_otp(value: str) -> str:
    return ''.join(ch for ch in str(value or '').strip() if ch.isalnum())


def verify_totp(secret: str, otp: str) -> bool:
    if not secret:
        return False
    code = _normalize_otp(otp)
    if not code.isdigit() or len(code) != 6:
        return False
    return bool(pyotp.TOTP(secret).verify(code, valid_window=TOTP_VALID_WINDOW))


def issue_pending_token(user: User) -> str:
    return str(TwoFactorPendingToken.for_user(user))


def user_from_pending_token(raw_token: str) -> User:
    try:
        token = TwoFactorPendingToken(raw_token)
    except TokenError as exc:
        raise ValueError('Invalid or expired two-factor token.') from exc

    user_id = token.payload.get(api_settings.USER_ID_CLAIM)
    if not user_id:
        raise ValueError('Invalid or expired two-factor token.')

    try:
        return User.objects.get(pk=user_id)
    except (User.DoesNotExist, ValueError, TypeError) as exc:
        raise ValueError('Invalid or expired two-factor token.') from exc


def generate_backup_codes(user: User, count: int = BACKUP_CODE_COUNT) -> list[str]:
    TwoFactorBackupCode.objects.filter(user=user).delete()
    codes: list[str] = []
    for _ in range(count):
        code = secrets.token_hex(4).upper()
        TwoFactorBackupCode.objects.create(user=user, code=code)
        codes.append(code)
    return codes


def consume_backup_code(user: User, otp: str) -> bool:
    code = _normalize_otp(otp).upper()
    if not code:
        return False
    backup = TwoFactorBackupCode.objects.filter(
        user=user, code__iexact=code, is_used=False
    ).first()
    if backup is None:
        return False
    backup.is_used = True
    backup.used_at = timezone.now()
    backup.save(update_fields=['is_used', 'used_at'])
    return True


def verify_second_factor(user: User, otp: str) -> bool:
    if verify_totp(user.two_factor_secret, otp):
        return True
    return consume_backup_code(user, otp)


def clear_two_factor(user: User) -> None:
    TwoFactorBackupCode.objects.filter(user=user).delete()
    user.two_factor_enabled = False
    user.two_factor_secret = ''
    user.save(update_fields=['two_factor_enabled', 'two_factor_secret'])
