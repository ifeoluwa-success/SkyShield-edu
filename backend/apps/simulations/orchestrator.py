import logging
import threading
from datetime import datetime, timezone, timedelta

from django.db import transaction
from django.db.models import Avg, Q

from .engine import SimulationEngine
from .mission_state import compose_mission_state
from .state_machine import (
    MissionStateMachine,
    PHASE_TIME_LIMITS,
    VALID_TRANSITIONS,
    OPERATIONAL_PHASES,
    indices_for_scenario_phase,
    linear_phase_successor,
)
from .models import IncidentRun, MissionParticipant, IncidentEvent, ThreatNode, Scenario
from .ws_channel import mission_group_send
from apps.analytics.models import UserPerformance, SkillAssessment, PerformanceTrend
from apps.simulations.models import UserDecision, SimulationSession


class MissionNotFound(Exception):
    pass


class InvalidPhaseTransition(Exception):
    pass


class UnauthorizedAction(Exception):
    pass


class MissionAlreadyComplete(Exception):
    pass


class PhaseTimedOut(Exception):
    pass


logger = logging.getLogger(__name__)

MISSION_PARTICIPANT_ROLES = frozenset(
    {'lead_operator', 'support_operator', 'observer', 'supervisor'}
)


def _defer_mission_notify(run_id, serialized_event=None):
    """
    Push mission_event + state_update on a background thread so HTTP handlers
    return before Redis/channel I/O (reduces client timeouts and broken pipes).
    """
    rid = str(run_id)

    def _work():
        try:
            orch = ScenarioOrchestrator()
            if serialized_event is not None:
                mission_group_send(
                    f'mission_{rid}',
                    {'type': 'mission_event', 'event': serialized_event},
                )
            orch.broadcast_mission_state_update(rid, trim_session=True)
        except Exception:
            logger.exception('mission.deferred_notify_failed run_id=%s', rid)

    threading.Thread(
        target=_work,
        daemon=True,
        name=f'mission-notify-{rid[:8]}',
    ).start()


class ScenarioOrchestrator:
    """
    High-level coordinator that manages IncidentRun lifecycle,
    participants, phase transitions, broadcasts, and scoring.
    """

    def start_mission(self, scenario_id, user, use_genie=False, operator_role='lead_operator'):
        """
        Start a new mission run for a scenario (optionally via Genie scenario generation).

        Returns a payload containing run id, briefing narrative, time limits, first step, and ws URL.
        """
        try:
            scenario = Scenario.objects.get(id=scenario_id)
        except Scenario.DoesNotExist as exc:
            raise MissionNotFound("Scenario not found") from exc

        gen = None
        if use_genie:
            from .genie_service import GenieScenarioGenerator
            gen = GenieScenarioGenerator()
            steps_data = gen.generate_incident(scenario.threat_type, scenario.difficulty, 'airport')

            scenario = Scenario.objects.create(
                title=steps_data.get('title') or f"{scenario.title} (Genie)",
                description=steps_data.get('description') or scenario.description,
                category=steps_data.get('category') or scenario.category,
                threat_type=steps_data.get('threat_type') or scenario.threat_type,
                difficulty=steps_data.get('difficulty') or scenario.difficulty,
                initial_state=steps_data.get('initial_state') or scenario.initial_state,
                steps=steps_data.get('steps') or scenario.steps,
                correct_actions=steps_data.get('correct_actions') or scenario.correct_actions,
                hints=steps_data.get('hints') or scenario.hints,
                learning_objectives=steps_data.get('learning_objectives') or scenario.learning_objectives,
                estimated_time=int(steps_data.get('estimated_time') or scenario.estimated_time),
                points_possible=int(steps_data.get('points_possible') or scenario.points_possible),
                passing_score=int(steps_data.get('passing_score') or scenario.passing_score),
                max_attempts=int(steps_data.get('max_attempts') or scenario.max_attempts),
                graph=steps_data.get('graph') or {},
                escalation_rules=steps_data.get('escalation_rules') or [],
                is_genie_generated=True,
            )

        run = IncidentRun.objects.create(
            scenario=scenario,
            phase='briefing',
            status='in_progress',
            session_state={'current_step': 0, 'current_score': 0, 'decisions': [], 'hints_used': 0},
            phase_started_at=None,
            is_genie_generated=bool(use_genie),
            genie_scenario_data={},
        )

        MissionParticipant.objects.create(
            run=run,
            user=user,
            role=operator_role,
            last_heartbeat=datetime.now(timezone.utc),
        )

        IncidentEvent.objects.create(
            run=run,
            event_type='participant_joined',
            actor=user,
            payload={'role': operator_role},
        )

        if use_genie and gen is not None:
            briefing = gen.generate_briefing_narrative(scenario, operator_role)
        else:
            briefing = scenario.description

        steps = scenario.steps or []
        first_step = steps[0] if steps else None

        return {
            'run_id': str(run.id),
            'briefing_narrative': briefing,
            'time_limits': PHASE_TIME_LIMITS,
            'first_step': first_step,
            'ws_url': f'/ws/mission/{run.id}/',
        }

    def acknowledge_briefing(self, run_id, user):
        """
        Mark a participant as ready and, if all are ready, transition run to detection and broadcast it.
        """
        try:
            run = IncidentRun.objects.select_related('scenario').get(id=run_id)
        except IncidentRun.DoesNotExist as exc:
            raise MissionNotFound("Mission run not found") from exc

        try:
            participant = MissionParticipant.objects.get(run=run, user=user)
        except MissionParticipant.DoesNotExist as exc:
            raise UnauthorizedAction("User is not a mission participant") from exc

        participant.is_ready = True
        participant.save()

        scenario = run.scenario
        qs = MissionParticipant.objects.filter(run=run)
        if getattr(scenario, 'requires_team_participation', False):
            all_ready = not qs.filter(is_ready=False).exists()
        else:
            if qs.count() <= 1:
                all_ready = participant.is_ready
            else:
                all_ready = MissionParticipant.objects.filter(
                    run=run, role='lead_operator', is_ready=True
                ).exists()

        sm = MissionStateMachine(run.phase)

        if all_ready:
            prev = run.phase
            run.phase = 'detection'
            run.phase_started_at = datetime.now(timezone.utc)
            run.save()

            event = IncidentEvent.objects.create(
                run=run,
                event_type='phase_changed',
                actor=user,
                payload={'from': prev, 'to': run.phase},
            )

            _defer_mission_notify(run_id, self._serialize_event(event))

        return {
            'run_id': str(run.id),
            'phase': run.phase,
            'time_remaining': sm.get_time_remaining(run.phase_started_at),
            'all_ready': bool(all_ready),
            'briefing_complete': bool(all_ready),
            'current_state': self.get_current_state(str(run_id)),
        }

    def submit_action(self, run_id, user, action_payload):
        """
        Validate and process an action submission, then broadcast the resulting event.
        """
        try:
            run = (
                IncidentRun.objects.select_related('scenario')
                .prefetch_related('mission_participants', 'mission_participants__user')
                .get(id=run_id)
            )
        except IncidentRun.DoesNotExist as exc:
            raise MissionNotFound("Mission run not found") from exc

        if run.status in ['completed', 'failed', 'abandoned']:
            raise MissionAlreadyComplete("Mission is already complete")

        if not MissionParticipant.objects.filter(run=run, user=user).exists():
            raise UnauthorizedAction("User is not authorized for this mission")

        if run.phase == 'review':
            if run.status == 'in_progress':
                self.finalize_mission(run)
            raise MissionAlreadyComplete("Mission has ended or is in review.")

        if run.phase == 'briefing':
            raise UnauthorizedAction(
                "Acknowledge the briefing before submitting decisions for this mission."
            )

        action_payload = dict(action_payload or {})
        if action_payload.get('action_type') == 'hint_request':
            return self.request_hint(run_id, user)

        sm = MissionStateMachine(run.phase)
        if sm.is_timed_out(run.phase_started_at):
            self.handle_timeout(run)
            raise PhaseTimedOut("Phase timed out before action submitted")

        engine = SimulationEngine()
        action_payload = dict(action_payload or {})
        action_payload['user'] = user
        event = engine.apply_action(run, action_payload)

        is_correct = (event.payload or {}).get('is_correct') is True
        run.refresh_from_db()
        self._sync_phases_after_correct_step(run, user, is_correct)

        run.refresh_from_db()
        if run.phase == 'review' and run.status == 'in_progress':
            self.finalize_mission(run)

        run.refresh_from_db()
        sm = MissionStateMachine(run.phase)

        _defer_mission_notify(run_id, self._serialize_event(event))

        return {
            'event': self._serialize_event(event),
            'current_state': self.get_current_state(run_id),
            'time_remaining': sm.get_time_remaining(run.phase_started_at),
            'score_so_far': (run.session_state or {}).get('current_score', 0),
        }

    def _skip_empty_operational_phases(self, run):
        """
        If the current operational phase has no mapped scenario steps, advance
        forward until we hit a phase with steps or reach review.
        """
        steps = run.scenario.steps or []
        for _ in range(8):
            run.refresh_from_db()
            if run.phase not in OPERATIONAL_PHASES or run.status != 'in_progress':
                break
            if indices_for_scenario_phase(steps, run.phase):
                break
            nxt = linear_phase_successor(run.phase)
            if not nxt:
                break
            self.advance_phase(run, nxt)

    def _sync_phases_after_correct_step(self, run, user, is_correct):
        """
        After a correct action that advanced the step cursor, optionally move
        to the next operational phase when all steps mapped to the current
        phase are complete. Chains through empty phases to reach review.
        """
        if not is_correct:
            return
        if not SimulationEngine.participant_may_advance_mission(run, user):
            return

        run.refresh_from_db()
        if run.status not in ('in_progress', 'not_started'):
            return

        steps = run.scenario.steps or []
        if not steps:
            return

        state = run.session_state or {}
        csr = int(state.get('current_step', 0) or 0)
        last_done = csr - 1
        if last_done < 0:
            return

        indices = indices_for_scenario_phase(steps, run.phase)
        if not indices or last_done != indices[-1]:
            return

        nxt = linear_phase_successor(run.phase)
        if not nxt:
            return

        self.advance_phase(run, nxt)
        run.refresh_from_db()
        self._skip_empty_operational_phases(run)

    def handle_timeout(self, run):
        """
        Record a timeout, apply penalties, force phase transition, broadcast, and save the run.
        """
        run_id = str(run.id)

        timeout_event = IncidentEvent.objects.create(
            run=run,
            event_type='timeout_occurred',
            actor=None,
            payload={'phase': run.phase},
        )

        state = run.session_state or {}
        current_score = float(state.get('current_score', 0) or 0)
        state['current_score'] = current_score - 20.0
        run.session_state = state

        if run.phase == 'detection':
            forced_next = 'review'
        else:
            allowed = VALID_TRANSITIONS.get(run.phase) or []
            forced_next = allowed[0] if allowed else run.phase

        prev = run.phase
        run.phase = forced_next
        run.phase_started_at = datetime.now(timezone.utc)
        run.save()

        phase_event = IncidentEvent.objects.create(
            run=run,
            event_type='phase_changed',
            actor=None,
            payload={'from': prev, 'to': run.phase, 'reason': 'timeout'},
        )

        mission_group_send(
            f'mission_{run_id}',
            {'type': 'mission_event', 'event': self._serialize_event(timeout_event)},
        )
        mission_group_send(
            f'mission_{run_id}',
            {'type': 'mission_event', 'event': self._serialize_event(phase_event)},
        )

        if forced_next == 'review':
            self.finalize_mission(run)

    def advance_phase(self, run, new_phase):
        """
        Move the mission to a new phase using the state machine, persist, emit an event, and broadcast.
        """
        sm = MissionStateMachine(run.phase)
        target_phase, is_valid, reason, side_effects = sm.transition(new_phase)
        if not is_valid:
            raise InvalidPhaseTransition(reason)

        prev = run.phase
        run.phase = target_phase
        run.phase_started_at = datetime.now(timezone.utc)
        run.save()

        event = IncidentEvent.objects.create(
            run=run,
            event_type='phase_changed',
            actor=None,
            payload={'from': prev, 'to': target_phase, 'side_effects': side_effects},
        )

        if target_phase == 'review':
            self.finalize_mission(run)

        mission_group_send(
            f'mission_{run.id}',
            {'type': 'mission_event', 'event': self._serialize_event(event)},
        )

        return {
            'phase': target_phase,
            'time_remaining': sm.get_time_remaining(run.phase_started_at),
            'side_effects': side_effects,
        }

    def _sync_course_and_scenario_stats(self, run, user, result):
        """Push immersive mission results into course module progress and scenario stats."""
        try:
            from .course_service import CourseService
            CourseService().record_incident_run_result(run.id, user)
        except Exception:
            logger.exception(
                'mission.course_progress_sync_failed run_id=%s user_id=%s',
                run.id,
                getattr(user, 'pk', None),
            )

        if result.get('passed') and run.scenario_id:
            try:
                started = run.started_at
                completed = run.completed_at or datetime.now(timezone.utc)
                time_spent = int((completed - started).total_seconds()) if started else 0
                run.scenario.update_stats(float(run.score or 0), max(0, time_spent))
            except Exception:
                logger.exception(
                    'mission.scenario_stats_update_failed run_id=%s scenario_id=%s',
                    run.id,
                    run.scenario_id,
                )

    def finalize_mission(self, run):
        """
        Compute final score, update run completion fields, update user analytics profiles, and emit a review event.
        """
        if run.status in ('completed', 'failed'):
            engine = SimulationEngine()
            result = engine.compute_final_score(run)
            lead = MissionParticipant.objects.filter(run=run).select_related('user').order_by('joined_at').first()
            if lead is not None:
                self._sync_course_and_scenario_stats(run, lead.user, result)
            return result

        engine = SimulationEngine()
        result = engine.compute_final_score(run)

        run.score = result['score']
        run.passed = result['passed']
        run.status = 'completed' if result['passed'] else 'failed'
        run.completed_at = datetime.now(timezone.utc)
        run.save()

        lead = MissionParticipant.objects.filter(run=run).select_related('user').order_by('joined_at').first()
        if lead is None:
            return result
        user = lead.user

        self._sync_course_and_scenario_stats(run, user, result)

        if hasattr(user, 'simulations_completed'):
            user.simulations_completed = int(getattr(user, 'simulations_completed') or 0) + 1
        if hasattr(user, 'total_score'):
            old_total = float(getattr(user, 'total_score') or 0)
            user.total_score = (old_total + float(run.score or 0)) / 2.0

        all_action_events = IncidentEvent.objects.filter(
            run__mission_participants__user=user,
            event_type='action_submitted',
        )
        total = all_action_events.count()
        correct = all_action_events.filter(payload__is_correct=True).count()
        if hasattr(user, 'accuracy_rate'):
            user.accuracy_rate = (correct / total * 100) if total else 0.0
        user.save()

        performance, created = UserPerformance.objects.get_or_create(user=user)
        if hasattr(performance, 'total_simulations'):
            performance.total_simulations = int(getattr(performance, 'total_simulations') or 0) + 1
        if hasattr(performance, 'average_score'):
            old_avg = float(getattr(performance, 'average_score') or 0)
            performance.average_score = 0.3 * float(run.score or 0) + 0.7 * old_avg
        performance.save()

        alpha = 0.3
        for assessment in SkillAssessment.objects.filter(user=user):
            old = float(getattr(assessment, 'score', 0) or 0)
            assessment.score = alpha * float(run.score or 0) + (1 - alpha) * old
            assessment.save()

        weak = list(SkillAssessment.objects.filter(user=user, score__lt=50).values_list('skill', flat=True))
        strong = list(SkillAssessment.objects.filter(user=user, score__gte=80).values_list('skill', flat=True))
        if hasattr(user, 'weak_areas'):
            user.weak_areas = weak
        if hasattr(user, 'strong_areas'):
            user.strong_areas = strong
        user.save()

        IncidentEvent.objects.create(
            run=run,
            event_type='phase_changed',
            actor=None,
            payload={'to': 'review', **result},
        )
        return result

    def request_hint(self, run_id, user):
        """
        Provide a hint for the current phase, apply the scoring penalty, and record a hint_requested event.
        """
        try:
            run = IncidentRun.objects.select_related('scenario').get(id=run_id)
        except IncidentRun.DoesNotExist as exc:
            raise MissionNotFound("Mission run not found") from exc

        if not MissionParticipant.objects.filter(run=run, user=user).exists():
            raise UnauthorizedAction("User is not authorized for this mission")

        state = run.session_state or {}
        idx = int(state.get('current_step', 0) or 0)
        steps = run.scenario.steps or []
        step_hint = None
        if idx < len(steps) and isinstance(steps[idx], dict):
            raw = steps[idx].get('hint')
            if raw is not None and str(raw).strip():
                step_hint = str(raw).strip()

        hints = run.scenario.hints
        hint_text = step_hint
        if hint_text is None and isinstance(hints, dict):
            hint_text = hints.get(run.phase)
        elif hint_text is None and isinstance(hints, list):
            hint_text = hints[idx] if idx < len(hints) else None

        if hint_text is None:
            hint_text = "No hint available for this step."

        state['hints_used'] = int(state.get('hints_used', 0) or 0) + 1
        state['current_score'] = float(state.get('current_score', 0) or 0) - 5.0
        run.session_state = state
        run.save()

        IncidentEvent.objects.create(
            run=run,
            event_type='hint_requested',
            actor=user,
            payload={'phase': run.phase, 'hint_text': hint_text},
        )

        return {'hint': hint_text, 'hints_used': state['hints_used'], 'score_penalty': -5}

    def abandon_mission(self, run_id, user):
        """
        Mark a mission as abandoned by the user, record an event, broadcast, and return status.
        """
        try:
            run = IncidentRun.objects.get(id=run_id)
        except IncidentRun.DoesNotExist as exc:
            raise MissionNotFound("Mission run not found") from exc

        if not MissionParticipant.objects.filter(run=run, user=user).exists():
            raise UnauthorizedAction("User is not authorized for this mission")

        run.status = 'abandoned'
        run.completed_at = datetime.now(timezone.utc)
        run.save()

        event = IncidentEvent.objects.create(
            run=run,
            event_type='system',
            actor=user,
            payload={'reason': 'user_abandoned'},
        )

        mission_group_send(
            f'mission_{run_id}',
            {'type': 'mission_event', 'event': self._serialize_event(event)},
        )

        return {'run_id': str(run.id), 'status': 'abandoned'}

    def join_mission(self, run_id, user, role='support_operator', *, broadcast=True):
        """
        Idempotently add user as MissionParticipant, log, optionally record event,
        and optionally broadcast updated mission state to the WebSocket group.

        WebSocket connect passes broadcast=False — the consumer sends
        connection_confirmed directly; skipping Redis here avoids multi-second
        connect stalls and client timeouts.
        """
        rid = str(run_id)
        try:
            run = (
                IncidentRun.objects.select_related('scenario')
                .prefetch_related('mission_participants')
                .get(id=rid)
            )
        except IncidentRun.DoesNotExist as exc:
            raise MissionNotFound("Mission run not found") from exc

        if run.status in ('completed', 'failed', 'abandoned'):
            raise MissionAlreadyComplete("Mission is no longer accepting participants")

        from .permissions import user_can_access_mission

        if not user_can_access_mission(user, run):
            raise UnauthorizedAction("User is not authorized for this mission")

        if role not in MISSION_PARTICIPANT_ROLES:
            role = 'support_operator'

        now = datetime.now(timezone.utc)
        participant, created = MissionParticipant.objects.get_or_create(
            run=run,
            user=user,
            defaults={
                'role': role,
                'is_active': True,
                'is_ready': False,
                'last_heartbeat': now,
            },
        )
        participant.is_active = True
        participant.last_heartbeat = now
        participant.save()

        if created:
            IncidentEvent.objects.create(
                run=run,
                event_type='participant_joined',
                actor=user,
                payload={'role': participant.role, 'source': 'join'},
            )

        logger.info(
            'mission.join_mission run_id=%s user_id=%s username=%s created=%s role=%s',
            rid,
            user.pk,
            getattr(user, 'username', ''),
            created,
            participant.role,
        )

        if broadcast:
            self.broadcast_mission_state_update(rid, trim_session=True)
        return participant, created

    def touch_participant_heartbeat(self, run_id, user):
        """Update last_heartbeat for WebSocket presence (best-effort)."""
        now = datetime.now(timezone.utc)
        MissionParticipant.objects.filter(run_id=run_id, user=user).update(last_heartbeat=now)

    def broadcast_mission_state_update(self, run_id, *, trim_session=False):
        """
        Push mission snapshot to all sockets in mission_{run_id} (single message).
        WebSocket broadcasts trim session_state.decisions to keep payloads small.
        """
        rid = str(run_id)
        try:
            state = self.get_current_state(rid, trim_session=trim_session)
        except MissionNotFound:
            return
        mission_group_send(
            f'mission_{rid}',
            {'type': 'state_update', 'data': state},
        )

    def apply_supervisor_intervention(self, run_id, supervisor, intervention_type, data):
        """
        Apply a supervisor/admin intervention to a mission run, record and broadcast it, then return current state.
        """
        try:
            run = IncidentRun.objects.select_related('scenario').get(id=run_id)
        except IncidentRun.DoesNotExist as exc:
            raise MissionNotFound("Mission run not found") from exc

        role = getattr(supervisor, 'role', None)
        if role not in ['supervisor', 'admin']:
            raise UnauthorizedAction("Supervisor role required")

        data = data or {}

        if intervention_type == 'INJECT_THREAT':
            threat = ThreatNode.objects.create(
                scenario=run.scenario,
                label=data.get('label'),
                severity=int(data.get('severity') or 3),
                trigger_condition={},
                consequence_payload=data,
                parent=None,
                phase=run.phase,
            )
            state = run.session_state or {}
            active = state.get('active_threats') or []
            if not isinstance(active, list):
                active = []
            active.append({'id': str(threat.id), 'label': threat.label, 'severity': threat.severity, 'phase': run.phase})
            state['active_threats'] = active
            run.session_state = state
            run.save()
        elif intervention_type == 'PAUSE':
            run.status = 'paused'
            run.save()
        elif intervention_type == 'FORCE_PHASE':
            self.advance_phase(run, data.get('target_phase'))
        elif intervention_type == 'OVERRIDE_DECISION':
            last = IncidentEvent.objects.filter(run=run, event_type='action_submitted').order_by('-timestamp').first()
            if last is not None:
                state = run.session_state or {}
                overrides = state.get('overrides') or []
                if not isinstance(overrides, list):
                    overrides = []
                overrides.append({'event_id': str(last.id), 'override': data})
                state['overrides'] = overrides
                run.session_state = state
                run.save()
        elif intervention_type == 'REDUCE_TIMER':
            limit_s = PHASE_TIME_LIMITS.get(run.phase)
            if limit_s and run.phase_started_at:
                sm = MissionStateMachine(run.phase)
                remaining = sm.get_time_remaining(run.phase_started_at)
                if remaining is not None:
                    new_remaining = remaining / 2.0
                    now = datetime.now(timezone.utc)
                    run.phase_started_at = now - timedelta(seconds=(limit_s - new_remaining))
                    run.save()

        event = IncidentEvent.objects.create(
            run=run,
            event_type='intervention_applied',
            actor=supervisor,
            payload={'type': intervention_type, 'data': data},
        )

        mission_group_send(
            f'mission_{run_id}',
            {'type': 'mission_event', 'event': self._serialize_event(event)},
        )

        return self.get_current_state(run_id)

    def get_current_state(self, run_id, *, trim_session=False):
        """
        Mission snapshot for REST GET /state/ and WebSocket state_update.
        trim_session caps session_state.decisions on broadcasts (not REST by default).
        """
        try:
            run = IncidentRun.objects.select_related('scenario').get(id=run_id)
        except IncidentRun.DoesNotExist as exc:
            raise MissionNotFound("Mission run not found") from exc

        last_events = list(
            IncidentEvent.objects.filter(run_id=run_id)
            .select_related('actor')
            .order_by('-timestamp')[:5]
        )
        active_threats = list(
            ThreatNode.objects.filter(scenario_id=run.scenario_id, phase=run.phase)
        )
        participants = list(
            MissionParticipant.objects.filter(run_id=run_id).select_related('user')
        )

        return compose_mission_state(
            run,
            participants=participants,
            last_events=last_events,
            active_threats=active_threats,
            serialize_event=self._serialize_event,
            serialize_participants=self._serialize_participants,
            serialize_threats=self._serialize_threats,
            trim_session=trim_session,
        )

    def _serialize_event(self, event):
        """
        Serialize an IncidentEvent using serializers if present, otherwise return a minimal dict.
        """
        try:
            from .serializers import IncidentEventSerializer
            return IncidentEventSerializer(event).data
        except Exception:
            return {
                'id': str(event.id),
                'event_type': event.event_type,
                'actor_id': (
                    str(event.actor_id)
                    if event.actor_id is not None
                    else None
                ),
                'payload': event.payload,
                'timestamp': event.timestamp.isoformat() if event.timestamp else None,
            }

    def _serialize_events(self, events):
        """
        Serialize a list of IncidentEvents.
        """
        try:
            from .serializers import IncidentEventSerializer
            return IncidentEventSerializer(events, many=True).data
        except Exception:
            return [self._serialize_event(e) for e in events]

    def _serialize_run(self, run):
        """
        Serialize an IncidentRun using serializers if present, otherwise return a minimal dict.
        """
        try:
            from .serializers import IncidentRunSerializer
            return IncidentRunSerializer(run).data
        except Exception:
            return {
                'id': str(run.id),
                'scenario_id': str(run.scenario_id),
                'phase': run.phase,
                'status': run.status,
                'session_state': run.session_state,
                'phase_started_at': run.phase_started_at.isoformat() if run.phase_started_at else None,
                'started_at': run.started_at.isoformat() if run.started_at else None,
                'completed_at': run.completed_at.isoformat() if run.completed_at else None,
                'score': run.score,
                'passed': run.passed,
            }

    def _serialize_participants(self, participants):
        """
        Serialize mission participants using serializers if present, otherwise return minimal dicts.
        """
        try:
            from .serializers import MissionParticipantSerializer
            return MissionParticipantSerializer(participants, many=True).data
        except Exception:
            out = []
            for p in participants:
                out.append({
                    'id': str(p.id),
                    'run_id': str(p.run_id),
                    'user_id': str(p.user_id),
                    'role': p.role,
                    'is_active': p.is_active,
                    'is_ready': p.is_ready,
                    'joined_at': p.joined_at.isoformat() if p.joined_at else None,
                    'last_seen': p.last_seen.isoformat() if p.last_seen else None,
                    'last_heartbeat': (
                        p.last_heartbeat.isoformat() if getattr(p, 'last_heartbeat', None) else None
                    ),
                })
            return out

    def _serialize_threats(self, threats):
        """
        Serialize ThreatNodes using serializers if present, otherwise return minimal dicts.
        """
        try:
            from .serializers import ThreatNodeSerializer
            return ThreatNodeSerializer(threats, many=True).data
        except Exception:
            return [
                {
                    'id': str(t.id),
                    'scenario_id': str(t.scenario_id),
                    'label': t.label,
                    'severity': t.severity,
                    'phase': t.phase,
                    'parent_id': str(t.parent_id) if t.parent_id else None,
                }
                for t in threats
            ]

