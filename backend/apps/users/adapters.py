"""django-allauth adapters for SkyShield user model."""
from __future__ import annotations

import re

from allauth.socialaccount.adapter import DefaultSocialAccountAdapter


def _username_from_email(email: str) -> str:
    local = (email or 'user').split('@')[0]
    base = re.sub(r'[^a-zA-Z0-9_]', '_', local)[:30] or 'user'
    return base


class SkyShieldSocialAccountAdapter(DefaultSocialAccountAdapter):
    """Ensure OAuth sign-ups get a valid username and trainee defaults."""

    def populate_user(self, request, sociallogin, data):
        user = super().populate_user(request, sociallogin, data)
        if user.pk:
            return user

        email = (data.get('email') or user.email or '').strip()
        if email and not user.email:
            user.email = email

        if not user.username:
            user.username = _username_from_email(email)

        if not user.role:
            user.role = 'trainee'
        if not user.status or user.status == 'pending':
            user.status = 'active'
        user.email_verified = True
        return user
