"""Shared helpers for database seeding."""
from __future__ import annotations

from contextlib import contextmanager

from django.db.models.signals import post_save

from apps.meetings.models import Meeting, MeetingParticipant
from apps.meetings.signals import meeting_created_handler, participant_joined_handler


@contextmanager
def mute_meeting_signals():
    """Skip per-row UserActivity/UserNotification work during bulk meeting seed."""
    post_save.disconnect(meeting_created_handler, sender=Meeting)
    post_save.disconnect(participant_joined_handler, sender=MeetingParticipant)
    try:
        yield
    finally:
        post_save.connect(meeting_created_handler, sender=Meeting)
        post_save.connect(participant_joined_handler, sender=MeetingParticipant)
