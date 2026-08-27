from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken
import pyotp

from apps.users.models import TwoFactorBackupCode, UserActivity
from apps.users.two_factor import (
    generate_backup_codes,
    generate_totp_secret,
)

User = get_user_model()

PROFILE_URL = '/api/users/profile/'
LOGIN_URL = '/api/users/login/'
SETUP_URL = '/api/users/2fa/setup/'
CONFIRM_URL = '/api/users/2fa/confirm/'
VERIFY_LOGIN_URL = '/api/users/2fa/verify-login/'
DISABLE_URL = '/api/users/2fa/disable/'
PASSWORD = 'TestPass123'


def _make_user(email='trainee@example.com', username='trainee', **extra):
    defaults = {
        'email': email,
        'username': username,
        'password': PASSWORD,
        'first_name': 'Ada',
        'last_name': 'Lovelace',
        'role': 'trainee',
        'status': 'active',
        'email_verified': True,
        'is_active': True,
    }
    defaults.update(extra)
    password = defaults.pop('password')
    user = User.objects.create_user(password=password, **defaults)
    return user


class ProfileMetricSecurityTests(APITestCase):
    def setUp(self):
        self.user = _make_user()
        self.user.total_score = 42.0
        self.user.accuracy_rate = 55.0
        self.user.simulations_completed = 3
        self.user.average_response_time = 12.5
        self.user.training_level = 'Beginner'
        self.user.certifications = [{'course': 'AVSEC', 'score': 80}]
        self.user.two_factor_enabled = False
        self.user.save()
        self.client.force_authenticate(user=self.user)

    def test_editable_profile_fields_still_work(self):
        response = self.client.patch(PROFILE_URL, {
            'first_name': 'Grace',
            'bio': 'Aviation security trainee',
            'organization': 'SkyShield',
            'email_notifications': False,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, 'Grace')
        self.assertEqual(self.user.bio, 'Aviation security trainee')
        self.assertEqual(self.user.organization, 'SkyShield')
        self.assertFalse(self.user.email_notifications)

    def test_patch_accuracy_rate_is_ignored(self):
        response = self.client.patch(PROFILE_URL, {'accuracy_rate': 100}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.accuracy_rate, 55.0)
        self.assertEqual(response.data['accuracy_rate'], 55.0)

    def test_patch_training_score_is_ignored(self):
        response = self.client.patch(PROFILE_URL, {
            'total_score': 999999,
            'simulations_completed': 99,
            'average_response_time': 0.1,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.total_score, 42.0)
        self.assertEqual(self.user.simulations_completed, 3)
        self.assertEqual(self.user.average_response_time, 12.5)

    def test_patch_certification_state_is_ignored(self):
        forged = [{'course': 'Forged Cert', 'score': 100}]
        response = self.client.patch(PROFILE_URL, {
            'certifications': forged,
            'training_level': 'Expert',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.training_level, 'Beginner')
        self.assertEqual(self.user.certifications, [{'course': 'AVSEC', 'score': 80}])

    def test_patch_two_factor_enabled_is_ignored(self):
        response = self.client.patch(PROFILE_URL, {'two_factor_enabled': True}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertFalse(self.user.two_factor_enabled)

        self.user.two_factor_enabled = True
        self.user.two_factor_secret = generate_totp_secret()
        self.user.save(update_fields=['two_factor_enabled', 'two_factor_secret'])

        response = self.client.patch(PROFILE_URL, {'two_factor_enabled': False}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.two_factor_enabled)

    def test_multiple_protected_fields_cannot_be_modified(self):
        response = self.client.patch(PROFILE_URL, {
            'accuracy': 100,
            'accuracy_rate': 100,
            'score': 999999,
            'total_score': 999999,
            'two_factor_enabled': True,
            'role': 'admin',
            'status': 'suspended',
            'email_verified': True,
            'first_name': 'Updated',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, 'Updated')
        self.assertEqual(self.user.accuracy_rate, 55.0)
        self.assertEqual(self.user.total_score, 42.0)
        self.assertFalse(self.user.two_factor_enabled)
        self.assertEqual(self.user.role, 'trainee')
        self.assertEqual(self.user.status, 'active')

    def test_put_protected_fields_are_ignored(self):
        response = self.client.put(PROFILE_URL, {
            'first_name': 'PutName',
            'last_name': 'PutLast',
            'total_score': 1,
            'accuracy_rate': 1,
            'two_factor_enabled': True,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, 'PutName')
        self.assertEqual(self.user.total_score, 42.0)
        self.assertFalse(self.user.two_factor_enabled)

    def test_legitimate_server_side_metric_updates_still_work(self):
        self.user.update_score(90)
        self.user.refresh_from_db()
        self.assertEqual(self.user.simulations_completed, 4)
        expected = (42.0 * 3 + 90) / 4
        self.assertAlmostEqual(self.user.total_score, expected)

        self.user.accuracy_rate = 88.0
        self.user.certifications = [
            {'course': 'AVSEC', 'score': 80},
            {'course': 'ICAO Annex 17', 'score': 91},
        ]
        self.user.save(update_fields=['accuracy_rate', 'certifications'])
        self.user.refresh_from_db()
        self.assertEqual(self.user.accuracy_rate, 88.0)
        self.assertEqual(len(self.user.certifications), 2)

    def test_two_factor_secret_is_not_exposed_on_profile(self):
        self.user.two_factor_secret = generate_totp_secret()
        self.user.save(update_fields=['two_factor_secret'])
        response = self.client.get(PROFILE_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn('two_factor_secret', response.data)

    def test_unauthenticated_profile_update_is_rejected(self):
        self.client.force_authenticate(user=None)
        response = self.client.patch(PROFILE_URL, {'first_name': 'Nope'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class TwoFactorEnrollmentTests(APITestCase):
    def setUp(self):
        self.user = _make_user()
        self.client.force_authenticate(user=self.user)

    def test_unauthenticated_user_cannot_start_setup(self):
        self.client.force_authenticate(user=None)
        response = self.client.post(SETUP_URL, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_authenticated_user_can_initiate_setup(self):
        response = self.client.post(SETUP_URL, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('secret', response.data)
        self.assertIn('otpauth_url', response.data)
        self.assertTrue(response.data['qr_code'].startswith('data:image/png;base64,'))
        self.assertFalse(response.data['two_factor_enabled'])
        self.user.refresh_from_db()
        self.assertEqual(self.user.two_factor_secret, response.data['secret'])
        self.assertFalse(self.user.two_factor_enabled)

    def test_two_factor_is_not_enabled_before_verification(self):
        self.client.post(SETUP_URL, {}, format='json')
        self.user.refresh_from_db()
        self.assertFalse(self.user.two_factor_enabled)
        self.assertTrue(self.user.two_factor_secret)

    def test_invalid_otp_cannot_enable_2fa(self):
        self.client.post(SETUP_URL, {}, format='json')
        response = self.client.post(CONFIRM_URL, {'otp': '00000a'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertFalse(self.user.two_factor_enabled)

    def test_valid_otp_enables_2fa_and_returns_backup_codes(self):
        setup = self.client.post(SETUP_URL, {}, format='json')
        otp = pyotp.TOTP(setup.data['secret']).now()
        response = self.client.post(CONFIRM_URL, {'otp': otp}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['two_factor_enabled'])
        self.assertEqual(len(response.data['backup_codes']), 8)
        self.user.refresh_from_db()
        self.assertTrue(self.user.two_factor_enabled)
        self.assertEqual(TwoFactorBackupCode.objects.filter(user=self.user).count(), 8)
        self.assertTrue(
            UserActivity.objects.filter(user=self.user, activity_type='two_factor_enabled').exists()
        )

    def test_confirm_without_setup_fails(self):
        response = self.client.post(CONFIRM_URL, {'otp': '123456'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertFalse(self.user.two_factor_enabled)

    def test_reseting_setup_invalidates_previous_secret(self):
        first = self.client.post(SETUP_URL, {}, format='json')
        old_secret = first.data['secret']
        second = self.client.post(SETUP_URL, {}, format='json')
        self.assertNotEqual(old_secret, second.data['secret'])
        stale_otp = pyotp.TOTP(old_secret).now()
        response = self.client.post(CONFIRM_URL, {'otp': stale_otp}, format='json')
        self.user.refresh_from_db()
        if stale_otp == pyotp.TOTP(second.data['secret']).now():
            self.skipTest('OTP collision between old and new secrets')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(self.user.two_factor_enabled)

        valid_otp = pyotp.TOTP(second.data['secret']).now()
        confirm = self.client.post(CONFIRM_URL, {'otp': valid_otp}, format='json')
        self.assertEqual(confirm.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.two_factor_enabled)

    def test_setup_rejected_when_already_enabled(self):
        setup = self.client.post(SETUP_URL, {}, format='json')
        otp = pyotp.TOTP(setup.data['secret']).now()
        self.client.post(CONFIRM_URL, {'otp': otp}, format='json')
        original_secret = User.objects.get(pk=self.user.pk).two_factor_secret
        response = self.client.post(SETUP_URL, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertEqual(self.user.two_factor_secret, original_secret)


class TwoFactorAuthenticationTests(APITestCase):
    def setUp(self):
        self.user = _make_user()

    def _enable_2fa(self):
        secret = generate_totp_secret()
        self.user.two_factor_secret = secret
        self.user.two_factor_enabled = True
        self.user.save(update_fields=['two_factor_secret', 'two_factor_enabled'])
        return secret

    def test_user_without_2fa_follows_existing_login_flow(self):
        response = self.client.post(LOGIN_URL, {
            'identifier': self.user.email,
            'password': PASSWORD,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.assertNotIn('temp_token', response.data)
        self.assertFalse(response.data.get('requires_2fa'))

    def test_user_with_2fa_cannot_obtain_session_without_second_factor(self):
        self._enable_2fa()
        response = self.client.post(LOGIN_URL, {
            'identifier': self.user.email,
            'password': PASSWORD,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['requires_2fa'])
        self.assertIn('temp_token', response.data)
        self.assertNotIn('access', response.data)
        self.assertNotIn('refresh', response.data)

    def test_pending_token_cannot_be_used_as_access_token(self):
        self._enable_2fa()
        login = self.client.post(LOGIN_URL, {
            'identifier': self.user.email,
            'password': PASSWORD,
        }, format='json')
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['temp_token']}")
        response = self.client.get(PROFILE_URL)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_invalid_second_factor_is_rejected(self):
        self._enable_2fa()
        login = self.client.post(LOGIN_URL, {
            'identifier': self.user.email,
            'password': PASSWORD,
        }, format='json')
        response = self.client.post(VERIFY_LOGIN_URL, {
            'temp_token': login.data['temp_token'],
            'otp': '00000a',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotIn('access', response.data)

    def test_valid_second_factor_completes_authentication(self):
        secret = self._enable_2fa()
        login = self.client.post(LOGIN_URL, {
            'identifier': self.user.email,
            'password': PASSWORD,
        }, format='json')
        otp = pyotp.TOTP(secret).now()
        response = self.client.post(VERIFY_LOGIN_URL, {
            'temp_token': login.data['temp_token'],
            'otp': otp,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.assertEqual(response.data['user']['email'], self.user.email)

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        profile = self.client.get(PROFILE_URL)
        self.assertEqual(profile.status_code, status.HTTP_200_OK)

    def test_backup_code_completes_authentication_and_is_single_use(self):
        self._enable_2fa()
        codes = generate_backup_codes(self.user)
        login = self.client.post(LOGIN_URL, {
            'identifier': self.user.email,
            'password': PASSWORD,
        }, format='json')
        response = self.client.post(VERIFY_LOGIN_URL, {
            'temp_token': login.data['temp_token'],
            'otp': codes[0],
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)

        login_again = self.client.post(LOGIN_URL, {
            'identifier': self.user.email,
            'password': PASSWORD,
        }, format='json')
        reused = self.client.post(VERIFY_LOGIN_URL, {
            'temp_token': login_again.data['temp_token'],
            'otp': codes[0],
        }, format='json')
        self.assertEqual(reused.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_pending_token_is_rejected(self):
        response = self.client.post(VERIFY_LOGIN_URL, {
            'temp_token': 'not-a-token',
            'otp': '123456',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_session_access_token_is_not_accepted_as_pending_token(self):
        access = str(RefreshToken.for_user(self.user).access_token)
        response = self.client.post(VERIFY_LOGIN_URL, {
            'temp_token': access,
            'otp': '123456',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class TwoFactorDisableTests(APITestCase):
    def setUp(self):
        self.user = _make_user()
        self.other = _make_user(email='other@example.com', username='other')
        self.secret = generate_totp_secret()
        self.user.two_factor_secret = self.secret
        self.user.two_factor_enabled = True
        self.user.save(update_fields=['two_factor_secret', 'two_factor_enabled'])
        generate_backup_codes(self.user)

    def test_unauthenticated_user_cannot_disable_2fa(self):
        response = self.client.post(DISABLE_URL, {
            'password': PASSWORD,
            'otp': pyotp.TOTP(self.secret).now(),
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.user.refresh_from_db()
        self.assertTrue(self.user.two_factor_enabled)

    def test_other_user_cannot_disable_another_users_2fa(self):
        self.client.force_authenticate(user=self.other)
        response = self.client.post(DISABLE_URL, {
            'password': PASSWORD,
            'otp': pyotp.TOTP(self.secret).now(),
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertTrue(self.user.two_factor_enabled)

    def test_profile_patch_cannot_disable_2fa(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(PROFILE_URL, {'two_factor_enabled': False}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.two_factor_enabled)

    def test_disable_requires_password_and_otp(self):
        self.client.force_authenticate(user=self.user)
        missing_password = self.client.post(DISABLE_URL, {
            'otp': pyotp.TOTP(self.secret).now(),
        }, format='json')
        self.assertEqual(missing_password.status_code, status.HTTP_400_BAD_REQUEST)

        wrong_password = self.client.post(DISABLE_URL, {
            'password': 'WrongPass123',
            'otp': pyotp.TOTP(self.secret).now(),
        }, format='json')
        self.assertEqual(wrong_password.status_code, status.HTTP_400_BAD_REQUEST)

        wrong_otp = self.client.post(DISABLE_URL, {
            'password': PASSWORD,
            'otp': '00000a',
        }, format='json')
        self.assertEqual(wrong_otp.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertTrue(self.user.two_factor_enabled)

    def test_successful_authorized_disable_works(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(DISABLE_URL, {
            'password': PASSWORD,
            'otp': pyotp.TOTP(self.secret).now(),
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['two_factor_enabled'])
        self.user.refresh_from_db()
        self.assertFalse(self.user.two_factor_enabled)
        self.assertEqual(self.user.two_factor_secret, '')
        self.assertEqual(TwoFactorBackupCode.objects.filter(user=self.user).count(), 0)
        self.assertTrue(
            UserActivity.objects.filter(user=self.user, activity_type='two_factor_disabled').exists()
        )

    def test_login_after_disable_does_not_require_2fa(self):
        self.client.force_authenticate(user=self.user)
        self.client.post(DISABLE_URL, {
            'password': PASSWORD,
            'otp': pyotp.TOTP(self.secret).now(),
        }, format='json')
        self.client.force_authenticate(user=None)
        response = self.client.post(LOGIN_URL, {
            'identifier': self.user.email,
            'password': PASSWORD,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertFalse(response.data.get('requires_2fa'))
