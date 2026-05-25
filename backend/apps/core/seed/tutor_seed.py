"""Seed tutor profiles, teaching materials, sessions, exercises."""
from __future__ import annotations

from datetime import timedelta

from django.utils import timezone

from apps.tutor.models import (
    Exercise,
    ExerciseAttempt,
    Report,
    SessionAttendance,
    StudentProgress,
    TeachingMaterial,
    TeachingSession,
    TutorProfile,
)

from .builders import exercise_questions
from .realistic import MEETING_TITLES, MATERIAL_SUFFIXES, professional_bio


def seed_tutor(ctx) -> None:
    ctx.write('Seeding tutor domain...')

    for instructor in ctx.instructors:
        profile, _ = TutorProfile.objects.get_or_create(
            user=instructor,
            defaults={
                'bio': professional_bio('instructor', 'SkyShield Africa Academy'),
                'experience_years': ctx.rng.randint(5, 18),
                'specialization': ['AVSEC', 'Incident Response', 'ATC Operations'],
                'qualifications': ['MSc Transport Management', 'ICAO AVSEC Certification'],
            },
        )
        ctx.tutor_profiles.append(profile)

    for supervisor in ctx.supervisors[: min(5, len(ctx.supervisors))]:
        profile, created = TutorProfile.objects.get_or_create(
            user=supervisor,
            defaults={
                'bio': professional_bio('supervisor', 'NCAA Aviation Security Unit'),
                'experience_years': ctx.rng.randint(8, 22),
            },
        )
        if created:
            ctx.tutor_profiles.append(profile)

    materials = []
    for profile in ctx.tutor_profiles:
        for m in range(ctx.rng.randint(2, 6)):
            mat = TeachingMaterial.objects.create(
                tutor=profile,
                title=f'{ctx.rng.choice(MATERIAL_SUFFIXES)} — {profile.user.last_name}',
                description='Instructor-authored resource for live sessions.',
                material_type=ctx.rng.choice(['video', 'document', 'presentation', 'quiz']),
                difficulty=ctx.rng.choice(['beginner', 'intermediate', 'advanced']),
                content={'sections': [{'title': 'Intro', 'body': 'Training content.'}]},
                duration_minutes=ctx.rng.randint(15, 90),
                is_published=ctx.rng.random() < 0.85,
                views_count=ctx.rng.randint(0, 200),
            )
            materials.append(mat)

        for s in range(ctx.rng.randint(1, 4)):
            start = timezone.now() + timedelta(days=ctx.rng.randint(-30, 30), hours=ctx.rng.randint(8, 16))
            session = TeachingSession.objects.create(
                tutor=profile,
                title=f'{ctx.rng.choice(MEETING_TITLES)} — {profile.user.first_name}',
                description='Synchronised training with Q&A.',
                session_type=ctx.rng.choice(['live', 'workshop', 'qanda']),
                platform=ctx.rng.choice(['google_meet', 'zoom', 'internal']),
                start_time=start,
                end_time=start + timedelta(hours=ctx.rng.randint(1, 2)),
                max_attendees=ctx.rng.randint(15, 50),
                is_cancelled=ctx.rng.random() < 0.05,
            )
            ctx.teaching_sessions.append(session)

        qs, ans, expl = exercise_questions(ctx.rng)
        ex = Exercise.objects.create(
            tutor=profile,
            title=f'Checkpoint Assessment — {profile.user.last_name}',
            description='Multiple-choice assessment after module readings.',
            exercise_type='multiple_choice',
            questions=qs,
            answers=ans,
            explanations=expl,
            time_limit_minutes=ctx.rng.randint(15, 45),
            passing_score=70,
            is_published=True,
            due_date=timezone.now() + timedelta(days=ctx.rng.randint(7, 45)),
        )
        for trainee in ctx.rng.sample(ctx.trainees, k=min(12, len(ctx.trainees))):
            if ctx.rng.random() < 0.6:
                ExerciseAttempt.objects.create(
                    exercise=ex,
                    student=trainee,
                    score=ctx.rng.uniform(50, 100),
                    answers=ans,
                    time_taken=ctx.rng.randint(300, 1800),
                    passed=ctx.rng.random() < 0.7,
                    attempt_number=1,
                    completed_at=timezone.now() - timedelta(days=ctx.rng.randint(0, 14)),
                )

    for profile in ctx.tutor_profiles[:5]:
        for trainee in ctx.rng.sample(ctx.trainees, k=min(8, len(ctx.trainees))):
            StudentProgress.objects.get_or_create(
                tutor=profile,
                student=trainee,
                defaults={
                    'average_score': ctx.rng.uniform(55, 95),
                    'total_time_spent': ctx.rng.randint(3600, 50000),
                    'strengths': ['communication'],
                    'areas_for_improvement': ['ransomware'],
                },
            )

    for profile in ctx.tutor_profiles[:3]:
        Report.objects.create(
            tutor=profile,
            title='Quarterly Trainee Performance Review',
            type='student_performance',
            status='published',
            metadata={'trainees_reviewed': ctx.rng.randint(10, 40), 'avg_score': ctx.rng.uniform(65, 88)},
        )

    for session in ctx.teaching_sessions[:20]:
        for trainee in ctx.rng.sample(ctx.trainees, k=ctx.rng.randint(3, 10)):
            SessionAttendance.objects.get_or_create(
                session=session,
                student=trainee,
                defaults={
                    'joined_at': session.start_time,
                    'duration_seconds': ctx.rng.randint(600, 3600),
                    'rating': ctx.rng.randint(3, 5),
                },
            )

    ctx.write(f'  Tutor profiles: {len(ctx.tutor_profiles)}, teaching materials: {len(materials)}.')
