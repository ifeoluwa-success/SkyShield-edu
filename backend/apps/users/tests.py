from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()


class JWTBlacklistLogoutTests(APITestCase):
    """Refresh tokens must be revoked via SimpleJWT blacklist on logout."""

    def setUp(self):
        self.user = User.objects.create_user(
            email='pilot@example.com',
            username='pilot',
            password='SecurePass1',
            status='active',
            email_verified=True,
        )

    def test_logout_blacklists_refresh_token(self):
        refresh = RefreshToken.for_user(self.user)
        access = str(refresh.access_token)
        refresh_str = str(refresh)

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
        logout_url = reverse('logout')
        response = self.client.post(logout_url, {'refresh': refresh_str}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            BlacklistedToken.objects.filter(token__jti=refresh['jti']).exists()
        )
        self.assertTrue(
            OutstandingToken.objects.filter(jti=refresh['jti']).exists()
        )

        with self.assertRaises(TokenError):
            RefreshToken(refresh_str).check_blacklist()

    def test_blacklisted_refresh_cannot_be_used_to_obtain_access_token(self):
        refresh = RefreshToken.for_user(self.user)
        refresh_str = str(refresh)

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
        logout_response = self.client.post(
            reverse('logout'),
            {'refresh': refresh_str},
            format='json',
        )
        self.assertEqual(logout_response.status_code, status.HTTP_200_OK)

        refresh_url = reverse('token_refresh')
        refresh_response = self.client.post(
            refresh_url,
            {'refresh': refresh_str},
            format='json',
        )
        self.assertEqual(refresh_response.status_code, status.HTTP_401_UNAUTHORIZED)
