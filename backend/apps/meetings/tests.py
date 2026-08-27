from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.meetings.models import Meeting, MeetingInvitation, MeetingParticipant
from apps.meetings.utils import authorize_meeting_websocket


User = get_user_model()


class MeetingWebSocketAuthTests(TestCase):
    def setUp(self):
        self.host = User.objects.create_user(
            email='host@example.com',
            username='host',
            password='Password1',
        )
        self.outsider = User.objects.create_user(
            email='outsider@example.com',
            username='outsider',
            password='Password1',
        )
        self.invitee = User.objects.create_user(
            email='invitee@example.com',
            username='invitee',
            password='Password1',
        )
        now = timezone.now()
        self.private = Meeting.objects.create(
            title='Private brief',
            host=self.host,
            meeting_code='privcode01',
            room_name='room_privcode01',
            meeting_type='group',
            status='live',
            scheduled_start=now,
            scheduled_end=now + timezone.timedelta(hours=1),
            is_private=True,
            password='secret',
            max_participants=10,
        )
        self.public = Meeting.objects.create(
            title='Public brief',
            host=self.host,
            meeting_code='pubcode001',
            room_name='room_pubcode001',
            meeting_type='group',
            status='live',
            scheduled_start=now,
            scheduled_end=now + timezone.timedelta(hours=1),
            is_private=False,
            max_participants=10,
        )

    def test_host_always_allowed(self):
        allowed, _ = authorize_meeting_websocket(self.private, self.host)
        self.assertTrue(allowed)

    def test_private_rejects_without_password_or_membership(self):
        allowed, reason = authorize_meeting_websocket(self.private, self.outsider)
        self.assertFalse(allowed)
        self.assertIn('password', reason.lower())

    def test_private_allows_with_correct_password(self):
        allowed, _ = authorize_meeting_websocket(
            self.private, self.outsider, password='secret',
        )
        self.assertTrue(allowed)

    def test_private_allows_existing_participant(self):
        MeetingParticipant.objects.create(
            meeting=self.private,
            user=self.outsider,
            role='participant',
            status='joining',
        )
        allowed, _ = authorize_meeting_websocket(self.private, self.outsider)
        self.assertTrue(allowed)

    def test_private_allows_accepted_invite(self):
        MeetingInvitation.objects.create(
            meeting=self.private,
            invited_user=self.invitee,
            invited_by=self.host,
            status='accepted',
            token='tok-1',
            expires_at=timezone.now() + timezone.timedelta(days=1),
        )
        allowed, _ = authorize_meeting_websocket(self.private, self.invitee)
        self.assertTrue(allowed)

    def test_public_allows_authenticated_user(self):
        allowed, _ = authorize_meeting_websocket(self.public, self.outsider)
        self.assertTrue(allowed)
