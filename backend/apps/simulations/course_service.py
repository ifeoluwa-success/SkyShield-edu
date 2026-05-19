import logging
import uuid
from statistics import mean

from django.db import transaction
from django.utils import timezone

from .models import (
    Course,
    CourseEnrollment,
    ModuleProgress,
    CourseCertificate,
    SimulationSession,
    IncidentRun,
)

logger = logging.getLogger(__name__)


class CourseService:
    """Business logic for structured simulation courses (enrollment, progress, certificates)."""

    @transaction.atomic
    def enroll(self, course_id, trainee):
        """
        Enroll a trainee in a course.
        1. Fetch Course or raise ValueError('Course not found')
        2. If not course.is_published: raise ValueError('Course not published')
        3. get_or_create CourseEnrollment(course, trainee)
        4. If created:
             modules = course.modules.order_by('position')
             For each module:
               status = 'unlocked' if position == 0 else 'locked'
               ModuleProgress.objects.create(...)
             Set enrollment.current_module = modules.first()
             enrollment.status = 'in_progress'
             enrollment.save()
        5. Return enrollment
        """
        try:
            course = Course.objects.prefetch_related('modules').get(pk=course_id)
        except Course.DoesNotExist:
            raise ValueError('Course not found')

        if not course.is_published:
            raise ValueError('Course not published')

        enrollment, created = CourseEnrollment.objects.get_or_create(
            course=course,
            trainee=trainee,
            defaults={'status': 'enrolled'},
        )

        if created:
            modules = list(course.modules.order_by('position'))
            for idx, module in enumerate(modules):
                status = 'unlocked' if idx == 0 else 'locked'
                ModuleProgress.objects.create(
                    enrollment=enrollment,
                    module=module,
                    status=status,
                )
            if modules:
                enrollment.current_module = modules[0]
            enrollment.status = 'in_progress'
            enrollment.save(update_fields=['current_module', 'status'])

        return enrollment

    @transaction.atomic
    def mark_reading_complete(self, enrollment_id, module_id, trainee):
        """
        Mark a reading module as passed.
        Called when trainee clicks "Mark as Complete" on a reading module.
        """
        try:
            progress = ModuleProgress.objects.select_related(
                'module', 'enrollment'
            ).get(
                enrollment_id=enrollment_id,
                module_id=module_id,
                enrollment__trainee=trainee,
            )
        except ModuleProgress.DoesNotExist:
            raise ValueError('Progress not found')

        if progress.module.module_type != 'reading':
            raise ValueError('Not a reading module')

        if progress.status == 'passed':
            return progress

        progress.status = 'passed'
        progress.passed_at = timezone.now()
        progress.save(update_fields=['status', 'passed_at'])

        self._advance_enrollment(progress.enrollment.id, trainee)
        progress.refresh_from_db()
        return progress

    @transaction.atomic
    def sync_session_from_incident_run(self, run, trainee, result=None):
        """
        Mirror a finalized IncidentRun onto the legacy SimulationSession row
        used by course checkpoints (same user/scenario/attempt_number=1).
        """
        if run.scenario_id is None:
            return None

        if result is None:
            from .engine import SimulationEngine
            result = SimulationEngine().compute_final_score(run)

        state = run.session_state or {}
        if not isinstance(state, dict):
            state = {}

        session, _ = SimulationSession.objects.get_or_create(
            user=trainee,
            scenario=run.scenario,
            attempt_number=1,
            defaults={'status': 'in_progress'},
        )

        breakdown = result.get('breakdown') or {}
        passed = bool(result.get('passed', run.passed))
        score = float(result.get('score', run.score) or 0)

        session.status = 'completed' if passed else 'failed'
        session.score = score
        session.passed = passed
        session.completed_at = run.completed_at or timezone.now()
        session.current_step = int(state.get('current_step', 0) or 0)
        session.hints_used = int(state.get('hints_used', 0) or 0)
        session.total_choices = int(breakdown.get('decisions_total', 0) or 0)
        session.correct_choices = int(breakdown.get('decisions_correct', 0) or 0)
        session.accuracy_rate = (
            (session.correct_choices / session.total_choices) * 100
            if session.total_choices
            else 0.0
        )
        session.session_state = {**state, 'incident_run_id': str(run.id)}
        session.save(
            update_fields=[
                'status',
                'score',
                'passed',
                'completed_at',
                'current_step',
                'hints_used',
                'total_choices',
                'correct_choices',
                'accuracy_rate',
                'session_state',
            ]
        )
        return session

    @transaction.atomic
    def record_incident_run_result(self, run_id, trainee):
        """
        After an immersive mission (IncidentRun) finalizes, update SimulationSession
        and advance linked course module progress (same path as classic sessions).
        """
        try:
            run = IncidentRun.objects.select_related('scenario').get(pk=run_id)
        except IncidentRun.DoesNotExist:
            return None

        if run.scenario_id is None:
            return None

        session = self.sync_session_from_incident_run(run, trainee)
        if session is None:
            return None

        try:
            return self.record_simulation_result(session.id, trainee)
        except Exception:
            logger.exception(
                'course.record_incident_run_result failed run_id=%s user_id=%s',
                run_id,
                getattr(trainee, 'pk', None),
            )
            return None

    @transaction.atomic
    def record_simulation_result(self, session_id, trainee):
        """
        Called after a SimulationSession completes.
        Returns ModuleProgress if updated, or None if session is not course-linked.
        """
        try:
            session = SimulationSession.objects.select_related(
                'scenario'
            ).get(pk=session_id)
        except SimulationSession.DoesNotExist:
            return None

        if session.scenario_id is None:
            return None

        progress = (
            ModuleProgress.objects.filter(
                enrollment__trainee=trainee,
                module__scenario_id=session.scenario_id,
                status__in=['unlocked', 'in_progress', 'failed'],
            )
            .select_related('module', 'enrollment')
            .order_by('module__position')
            .first()
        )

        if progress is None:
            return None

        progress.attempts += 1

        passed_threshold = (
            session.passed
            and session.score is not None
            and session.score >= progress.module.minimum_passing_score
        )

        if passed_threshold:
            progress.status = 'passed'
            progress.best_score = session.score
            progress.passed_at = timezone.now()
            progress.linked_session = session
            progress.save(
                update_fields=[
                    'attempts',
                    'status',
                    'best_score',
                    'passed_at',
                    'linked_session',
                ]
            )
            self._advance_enrollment(progress.enrollment.id, trainee)
            progress.refresh_from_db()
            return progress

        progress.status = 'failed'
        if session.score is not None:
            prev_best = progress.best_score or 0
            progress.best_score = max(prev_best, session.score)

        if progress.attempts >= progress.module.max_simulation_attempts:
            pass

        progress.save(
            update_fields=['attempts', 'status', 'best_score']
        )
        return progress

    def _advance_enrollment(self, enrollment_id, trainee):
        """
        Internal. Called after any module is passed.
        Unlocks the next module or completes the course.
        """
        enrollment = (
            CourseEnrollment.objects.select_related('course')
            .prefetch_related(
                'course__modules',
                'module_progresses',
                'module_progresses__module',
            )
            .get(pk=enrollment_id, trainee=trainee)
        )

        modules = list(enrollment.course.modules.order_by('position'))
        progresses = {
            p.module_id: p for p in enrollment.module_progresses.all()
        }

        for mod in modules:
            prog = progresses.get(mod.id)
            if prog is None:
                continue
            if prog.status != 'passed':
                if prog.status == 'locked':
                    prog.status = 'unlocked'
                    prog.save(update_fields=['status'])
                enrollment.current_module = mod
                enrollment.save(update_fields=['current_module'])
                return

        self._complete_course(enrollment)

    @transaction.atomic
    def _complete_course(self, enrollment):
        """
        Internal. Called when all modules are passed.
        Issues certificate if score threshold met.
        """
        enrollment = CourseEnrollment.objects.select_related(
            'course', 'trainee'
        ).prefetch_related(
            'module_progresses',
            'module_progresses__module',
        ).get(pk=enrollment.pk)

        sim_progresses = [
            p
            for p in enrollment.module_progresses.all()
            if p.module.module_type == 'simulation' and p.status == 'passed'
        ]

        if sim_progresses:
            scores = [p.best_score for p in sim_progresses if p.best_score is not None]
            avg = mean(scores) if scores else 0.0
        else:
            avg = 100.0

        enrollment.average_simulation_score = avg
        enrollment.status = 'completed'
        enrollment.completed_at = timezone.now()
        enrollment.save(
            update_fields=[
                'average_simulation_score',
                'status',
                'completed_at',
            ]
        )

        if avg >= enrollment.course.passing_threshold:
            cert_number = (
                f"SKY-{timezone.now().year}-{str(uuid.uuid4())[:8].upper()}"
            )
            CourseCertificate.objects.create(
                enrollment=enrollment,
                certificate_number=cert_number,
                final_score=avg,
                issued_by=None,
            )
            enrollment.status = 'certificate_issued'
            enrollment.save(update_fields=['status'])

            user = enrollment.trainee
            certs = list(user.certifications or [])
            certs.append({
                'course': enrollment.course.title,
                'certificate_number': cert_number,
                'issued_at': timezone.now().isoformat(),
                'score': avg,
            })
            user.certifications = certs
            user.save(update_fields=['certifications'])

        return enrollment

    def get_enrollment_detail(self, enrollment_id, trainee):
        """
        Return full enrollment state for a trainee.
        """
        return CourseEnrollment.objects.select_related(
            'course', 'current_module'
        ).prefetch_related(
            'course__modules',
            'module_progresses',
            'module_progresses__module',
            'certificate',
        ).get(pk=enrollment_id, trainee=trainee)

    @transaction.atomic
    def reset_module_attempts(self, enrollment_id, module_id, supervisor):
        """
        Supervisor resets a trainee's failed module so they can retry.
        """
        role = getattr(supervisor, 'role', None)
        if role not in ['supervisor', 'admin', 'instructor']:
            raise ValueError('Insufficient permissions')

        try:
            progress = ModuleProgress.objects.select_related(
                'module', 'enrollment'
            ).get(
                enrollment_id=enrollment_id,
                module_id=module_id,
            )
        except ModuleProgress.DoesNotExist:
            raise ValueError('Progress not found')

        progress.status = 'unlocked'
        progress.attempts = 0
        progress.save(update_fields=['status', 'attempts'])
        return progress
