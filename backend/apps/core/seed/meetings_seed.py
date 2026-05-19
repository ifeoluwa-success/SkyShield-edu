"""Seed meetings, participants, invitations, chat, recordings."""
from __future__ import annotations

from datetime import timedelta

from django.utils import timezone

from apps.meetings.models import (
    Meeting,
    MeetingChat,
    MeetingInvitation,
    MeetingParticipant,
    MeetingRecording,
)

from .constants import SEED_TAG
from .utils import mute_meeting_signals


def seed_meetings(ctx) -> None:
    ctx.write('Seeding meetings...')

    hosts = ctx.instructors + ctx.supervisors
    participant_batch: list[MeetingParticipant] = []
    with mute_meeting_signals():
        _seed_meeting_rows(ctx, hosts, participant_batch)

    if participant_batch:
        MeetingParticipant.objects.bulk_create(participant_batch, batch_size=500)

    for meeting in ctx.meetings:
        meeting.participant_count = len(meeting._seed_participant_count)
        meeting.save(update_fields=['participant_count'])

    ctx.write(f'  Meetings: {len(ctx.meetings)}.')


def _seed_meeting_rows(ctx, hosts, participant_batch: list) -> None:
    for _ in range(ctx.scale['meetings']):
        host = ctx.rng.choice(hosts)
        tutor = None
        if hasattr(host, 'tutor_profile'):
            try:
                tutor = host.tutor_profile
            except Exception:
                tutor = None

        start = timezone.now() + timedelta(days=ctx.rng.randint(-45, 30), hours=ctx.rng.randint(7, 18))
        status = ctx.rng.choice(['scheduled', 'scheduled', 'live', 'ended', 'ended', 'cancelled'])
        meeting = Meeting(
            title=f'{SEED_TAG} {ctx.rng.choice(["AVSEC Briefing", "Scenario Debrief", "ATC Cyber Workshop"])}',
            description='Synchronised training session for SkyShield cohort.',
            host=host,
            tutor_profile=tutor,
            meeting_type=ctx.rng.choice(['group', 'workshop', 'webinar']),
            status=status,
            scheduled_start=start,
            scheduled_end=start + timedelta(hours=ctx.rng.randint(1, 3)),
            max_participants=ctx.rng.randint(20, 80),
            is_private=ctx.rng.random() < 0.2,
            participant_count=0,
        )
        if status in ('live', 'ended'):
            meeting.actual_start = start
        if status == 'ended':
            meeting.actual_end = meeting.scheduled_end
            meeting.duration_seconds = int((meeting.actual_end - meeting.actual_start).total_seconds())
        meeting.save()
        ctx.meetings.append(meeting)

        attendees = ctx.rng.sample(ctx.trainees, k=min(len(ctx.trainees), ctx.rng.randint(5, 25)))
        meeting._seed_participant_count = len(attendees)
        for trainee in attendees:
            joined = start + timedelta(minutes=ctx.rng.randint(0, 15))
            participant_batch.append(MeetingParticipant(
                meeting=meeting,
                user=trainee,
                role='participant',
                joined_at=joined,
                left_at=joined + timedelta(minutes=ctx.rng.randint(30, 90)) if status == 'ended' else None,
                is_active=status == 'live',
            ))

        if ctx.rng.random() < 0.35:
            invited = ctx.rng.choice(ctx.trainees)
            MeetingInvitation.objects.get_or_create(
                meeting=meeting,
                invited_user=invited,
                defaults={
                    'invited_by': host,
                    'status': ctx.rng.choice(['pending', 'accepted', 'declined']),
                },
            )

        if status == 'ended' and ctx.rng.random() < 0.4:
            MeetingRecording.objects.create(
                meeting=meeting,
                requested_by=host,
                status='completed',
                file_path=f'recordings/{meeting.meeting_code}.mp4',
                file_size=int(ctx.rng.uniform(50e6, 450e6)),
                duration_seconds=meeting.duration_seconds or 3600,
                completed_at=timezone.now(),
            )

        for _ in range(ctx.rng.randint(0, 8)):
            sender = ctx.rng.choice(attendees + [host])
            MeetingChat.objects.create(
                meeting=meeting,
                sender=sender,
                content=ctx.rng.choice([
                    'Can we review the spoofing timeline?',
                    'Sharing SOP excerpt in chat.',
                    'Confirmed — escalating to supervisor.',
                ]),
                message_type='text',
            )
