"""
Optimized mission state payloads for REST and WebSocket.

Avoids nested DRF serializers and trims unbounded session_state fields on broadcasts.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable, Optional

from .answer_keys import (
    sanitize_session_state_for_trainee,
    sanitize_step,
    sanitize_steps,
)
from .state_machine import MissionStateMachine, PHASE_TIME_LIMITS, indices_for_scenario_phase


def trim_session_state(session_state: Optional[dict], *, max_decisions: int = 20) -> dict:
    """Drop or cap heavy keys before sending over WebSocket."""
    st = sanitize_session_state_for_trainee(session_state)
    decisions = st.get('decisions')
    if isinstance(decisions, list) and len(decisions) > max_decisions:
        st['decisions'] = decisions[-max_decisions:]
        st['decisions_truncated'] = True
    return st


def build_scenario_mission_payload(scenario) -> dict[str, Any]:
    """Scenario fields required by the mission player (no graph / correct_actions)."""
    hints = scenario.hints
    if isinstance(hints, list):
        hints_payload: Any = hints
    elif isinstance(hints, dict):
        hints_payload = hints
    else:
        hints_payload = {}

    return {
        'id': str(scenario.id),
        'title': scenario.title,
        'description': scenario.description,
        'threat_type': scenario.threat_type,
        'difficulty': scenario.difficulty,
        'steps': sanitize_steps(scenario.steps or []),
        'hints': hints_payload,
        'passing_score': scenario.passing_score,
        'points_possible': scenario.points_possible,
        'requires_team_participation': getattr(
            scenario, 'requires_team_participation', False
        ),
    }


def build_run_mission_payload(run, *, trim_session: bool = False) -> dict[str, Any]:
    """Lightweight run dict (replaces IncidentRunSerializer on hot paths)."""
    st = sanitize_session_state_for_trainee(run.session_state)
    if trim_session:
        st = trim_session_state(st)

    return {
        'id': str(run.id),
        'scenario': build_scenario_mission_payload(run.scenario),
        'phase': run.phase,
        'status': run.status,
        'session_state': st,
        'phase_started_at': (
            run.phase_started_at.isoformat() if run.phase_started_at else None
        ),
        'started_at': run.started_at.isoformat() if run.started_at else None,
        'completed_at': (
            run.completed_at.isoformat() if run.completed_at else None
        ),
        'score': run.score,
        'passed': run.passed,
        'is_genie_generated': run.is_genie_generated,
    }


def materialize_active_step(steps: list, index: int) -> Optional[dict]:
    """Step row for cold-boot / reconnect UIs (matches frontend ScenarioStep shape)."""
    if not steps or index < 0 or index >= len(steps):
        return None
    raw = steps[index]
    if not isinstance(raw, dict):
        return None
    cleaned = sanitize_step(raw)
    options = cleaned.get('options') or []
    return {
        'step_id': cleaned.get('step_id') or cleaned.get('id'),
        'phase': cleaned.get('phase') or cleaned.get('mission_phase'),
        'title': cleaned.get('title'),
        'description': (
            cleaned.get('description')
            or cleaned.get('narrative')
            or cleaned.get('question')
        ),
        'points_value': cleaned.get('points_value', cleaned.get('points', 10)),
        'time_limit_seconds': cleaned.get('time_limit_seconds'),
        'options': options,
        'hint': cleaned.get('hint'),
    }


def compose_mission_state(
    run,
    *,
    participants: Iterable,
    last_events: list,
    active_threats: list,
    serialize_event,
    serialize_participants,
    serialize_threats,
    trim_session: bool = False,
) -> dict[str, Any]:
    """Full mission snapshot without DRF nested serializers."""
    sm = MissionStateMachine(run.phase)
    steps = run.scenario.steps or []
    n = len(steps)
    st = sanitize_session_state_for_trainee(run.session_state)
    csr = int(st.get('current_step', 0) or 0)
    if n == 0:
        active_step_index = 0
        steps_completed = 0
    elif csr < n:
        active_step_index = csr
        steps_completed = csr
    else:
        active_step_index = n - 1
        steps_completed = n

    st['current_step'] = active_step_index
    if trim_session:
        st = trim_session_state(st)

    run_payload = build_run_mission_payload(run, trim_session=trim_session)
    if isinstance(run_payload.get('session_state'), dict):
        run_payload['session_state'] = dict(run_payload['session_state'])
        run_payload['session_state']['current_step'] = active_step_index

    now = datetime.now(timezone.utc)

    return {
        'run': run_payload,
        'phase': run.phase,
        'status': run.status,
        'time_remaining': sm.get_time_remaining(run.phase_started_at),
        'participants': serialize_participants(participants),
        'last_5_events': serialize_events(last_events, serialize_event),
        'score_so_far': st.get('current_score', 0),
        'active_threats': serialize_threats(active_threats),
        'current_step': active_step_index,
        'steps_completed': steps_completed,
        'total_steps': n,
        'phase_step_indices': indices_for_scenario_phase(steps, run.phase),
        'active_step': materialize_active_step(steps, active_step_index),
        'phase_time_limits': dict(PHASE_TIME_LIMITS),
        'requires_team_participation': getattr(
            run.scenario, 'requires_team_participation', False
        ),
        'snapshot_at': now.isoformat(),
        'resumable': run.status in ('in_progress', 'not_started', 'paused'),
    }


def serialize_events(events: list, serialize_event) -> list:
    return [serialize_event(e) for e in events]
