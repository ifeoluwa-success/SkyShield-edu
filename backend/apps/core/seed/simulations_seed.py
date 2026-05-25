"""Seed scenarios, courses, sessions, incident runs, certificates."""
from __future__ import annotations

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.analytics.models import SimulationAnalytics

User = get_user_model()
from apps.simulations.models import (
    Course,
    CourseCertificate,
    CourseEnrollment,
    CourseModule,
    IncidentEvent,
    IncidentRun,
    MissionParticipant,
    ModuleProgress,
    Scenario,
    ScenarioAchievement,
    ScenarioBookmark,
    ScenarioComment,
    SimulationSession,
    UserDecision,
)

from .builders import scenario_payload
from .constants import THREAT_TOPICS
from .realistic import incident_payload


def seed_simulations(ctx) -> None:
    ctx.write('Seeding simulations & courses...')

    creator = ctx.rng.choice(ctx.supervisors)
    for i in range(ctx.scale['scenarios']):
        topic = THREAT_TOPICS[i % len(THREAT_TOPICS)]
        title = topic[0]
        if Scenario.objects.filter(title=title).exists():
            continue
        payload = scenario_payload(ctx.rng, title, topic[1], topic[2])
        payload['created_by'] = creator
        sc = Scenario.objects.create(**payload)
        ctx.scenarios.append(sc)

    enrollments = []
    for c in range(ctx.scale['courses']):
        topic = THREAT_TOPICS[c % len(THREAT_TOPICS)]
        course = Course.objects.create(
            title=f'{topic[0]} — Certification Track',
            description=f'Structured programme covering {topic[0]} with readings and simulation checkpoints.',
            threat_focus=topic[0].split()[0],
            difficulty=ctx.rng.randint(1, 4),
            created_by=ctx.rng.choice(ctx.supervisors),
            is_published=True,
            estimated_hours=ctx.rng.uniform(3, 12),
            passing_threshold=ctx.rng.choice([70.0, 72.0, 75.0, 78.0]),
        )
        ctx.courses.append(course)
        sim_mods = 0
        for pos in range(ctx.rng.randint(4, 8)):
            if pos % 2 == 0 or not ctx.scenarios:
                CourseModule.objects.create(
                    course=course,
                    title=f'Module {pos + 1}: Concepts & SOP',
                    description='Reading and review questions.',
                    module_type='reading',
                    position=pos,
                    content_body=f'# Module {pos + 1}\n\nStudy material for {course.title}.',
                )
            else:
                sc = ctx.rng.choice(ctx.scenarios)
                CourseModule.objects.create(
                    course=course,
                    title=f'Module {pos + 1}: Simulation — {sc.title[:40]}',
                    module_type='simulation',
                    position=pos,
                    scenario=sc,
                    minimum_passing_score=sc.passing_score,
                )
                sim_mods += 1

        enrollments.extend(_seed_enrollments_for_course(ctx, course))

    _seed_sessions(ctx)
    _seed_incident_runs(ctx)
    ctx.write(f'  Scenarios: {len(ctx.scenarios)}, courses: {len(ctx.courses)}, enrollments: {len(enrollments)}.')


def _seed_enrollments_for_course(ctx, course: Course) -> list:
    """Create enrollments immediately after course/modules so FKs are always valid."""
    course.refresh_from_db()
    if not Course.objects.filter(pk=course.pk).exists():
        return []

    enrollments = []
    modules = list(course.modules.order_by('position'))
    trainees = ctx.rng.sample(ctx.trainees, k=min(len(ctx.trainees), ctx.rng.randint(15, 60)))

    for trainee in trainees:
        status = ctx.rng.choice(['enrolled', 'in_progress', 'completed', 'certificate_issued'])
        enr, created = CourseEnrollment.objects.get_or_create(
            course_id=course.pk,
            trainee_id=trainee.pk,
            defaults={
                'status': status,
                'enrolled_at': timezone.now() - timedelta(days=ctx.rng.randint(1, 90)),
            },
        )
        if not created and enr.status != status:
            enr.status = status
            enr.save(update_fields=['status'])
        enrollments.append(enr)

        progress_rows = []
        for idx, mod in enumerate(modules):
            mp_status = 'locked'
            if idx == 0:
                mp_status = ctx.rng.choice(['in_progress', 'passed'])
            elif ctx.rng.random() < 0.5:
                mp_status = 'passed'
            progress_rows.append(ModuleProgress(
                enrollment_id=enr.pk,
                module_id=mod.pk,
                status=mp_status,
                best_score=ctx.rng.uniform(55, 98) if mp_status == 'passed' else None,
                attempts=ctx.rng.randint(1, 3),
            ))
        ModuleProgress.objects.bulk_create(progress_rows, ignore_conflicts=True)

        if status == 'certificate_issued' and ctx.rng.random() < 0.8:
            cert_no = f'SKY-2026-{enr.id.hex[:8].upper()}'
            issuer_ids = list(
                User.objects.filter(role__in=['supervisor', 'admin']).values_list('pk', flat=True)[:50]
            )
            issuer_id = ctx.rng.choice(issuer_ids) if issuer_ids else None
            CourseCertificate.objects.get_or_create(
                enrollment_id=enr.pk,
                defaults={
                    'certificate_number': cert_no,
                    'final_score': ctx.rng.uniform(72, 96),
                    'issued_by_id': issuer_id,
                },
            )
    return enrollments


def _seed_sessions(ctx) -> None:
    sessions = []
    used_keys: set[tuple] = set()
    target = ctx.scale['sessions']
    tries = 0
    max_tries = target * 10
    while len(sessions) < target and tries < max_tries:
        tries += 1
        user = ctx.rng.choice(ctx.trainees)
        scenario = ctx.rng.choice(ctx.scenarios)
        attempt = ctx.rng.randint(1, 3)
        key = (user.pk, scenario.pk, attempt)
        if key in used_keys:
            continue
        used_keys.add(key)
        status = ctx.rng.choice(['completed', 'completed', 'in_progress', 'failed', 'abandoned'])
        total = ctx.rng.randint(3, 8)
        correct = ctx.rng.randint(0, total)
        started = timezone.now() - timedelta(days=ctx.rng.randint(0, 90))
        sess = SimulationSession(
            user=user,
            scenario=scenario,
            status=status,
            current_step=ctx.rng.randint(0, max(0, len(scenario.steps) - 1)),
            score=ctx.rng.uniform(45, 98) if status == 'completed' else None,
            time_spent=ctx.rng.randint(300, 2400),
            correct_choices=correct,
            total_choices=total,
            accuracy_rate=(correct / total * 100) if total else 0,
            hints_used=ctx.rng.randint(0, 3),
            attempt_number=attempt,
            passed=status == 'completed' and ctx.rng.random() < 0.7,
            started_at=started,
            completed_at=started + timedelta(minutes=ctx.rng.randint(10, 40)) if status == 'completed' else None,
        )
        sessions.append(sess)

    SimulationSession.objects.bulk_create(sessions, batch_size=400, ignore_conflicts=True)
    scenario_ids = [s.id for s in ctx.scenarios]
    for sess in list(
        SimulationSession.objects.filter(scenario_id__in=scenario_ids).select_related('scenario')[:200]
    ):
        if ctx.rng.random() < 0.6:
            SimulationAnalytics.objects.get_or_create(
                session=sess,
                defaults={
                    'decision_times': [ctx.rng.uniform(5, 60) for _ in range(3)],
                    'accuracy_based_score': sess.score or 0,
                    'learning_progress': ctx.rng.uniform(0.3, 1.0),
                },
            )
        if ctx.rng.random() < 0.25:
            UserDecision.objects.create(
                session=sess,
                step_number=0,
                decision_type='choice',
                decision_data={'choice': sess.scenario.steps[0]['correct_actions'][0] if sess.scenario.steps else 'opt'},
                is_correct=True,
                time_taken=ctx.rng.randint(5, 90),
            )

    for _ in range(30):
        ScenarioBookmark.objects.get_or_create(
            user=ctx.rng.choice(ctx.trainees),
            scenario=ctx.rng.choice(ctx.scenarios),
        )
        if ctx.rng.random() < 0.5:
            ScenarioComment.objects.create(
                user=ctx.rng.choice(ctx.trainees),
                scenario=ctx.rng.choice(ctx.scenarios),
                content='Challenging but realistic for our airspace.',
            )


def _seed_incident_runs(ctx) -> None:
    phases = ['briefing', 'detection', 'investigation', 'containment', 'recovery', 'review']
    for _ in range(ctx.scale['incident_runs']):
        scenario = ctx.rng.choice(ctx.scenarios)
        lead = ctx.rng.choice(ctx.trainees)
        status = ctx.rng.choice(['completed', 'in_progress', 'failed', 'abandoned'])
        phase = ctx.rng.choice(phases) if status != 'completed' else 'review'
        run = IncidentRun.objects.create(
            scenario=scenario,
            phase=phase,
            status='in_progress' if status == 'in_progress' else status,
            session_state={'current_step': ctx.rng.randint(0, 2), 'current_score': ctx.rng.randint(40, 95)},
            phase_started_at=timezone.now() - timedelta(minutes=ctx.rng.randint(5, 120)),
            score=ctx.rng.uniform(50, 98) if status in ('completed', 'failed') else None,
            passed=status == 'completed' and ctx.rng.random() < 0.65,
            completed_at=timezone.now() if status in ('completed', 'failed', 'abandoned') else None,
        )
        MissionParticipant.objects.create(run=run, user=lead, role='lead_operator', is_ready=True)
        if scenario.requires_team_participation and ctx.rng.random() < 0.7:
            support = ctx.rng.choice([t for t in ctx.trainees if t.id != lead.id])
            MissionParticipant.objects.create(run=run, user=support, role='support_operator', is_ready=ctx.rng.random() < 0.8)

        for et in ('participant_joined', 'action_submitted', 'phase_changed'):
            IncidentEvent.objects.create(
                run=run,
                event_type=et,
                actor=lead,
                payload=incident_payload(ctx.rng, et),
            )

    for _ in range(min(40, len(ctx.trainees))):
        ScenarioAchievement.objects.get_or_create(
            user=ctx.rng.choice(ctx.trainees),
            scenario=ctx.rng.choice(ctx.scenarios),
            achievement_type=ctx.rng.choice(['first_completion', 'perfect_score', 'no_hints']),
        )
