from enum import Enum
from datetime import datetime, timezone

PHASE_TIME_LIMITS = {
    'detection': 60,
    'investigation': 120,
    'containment': 90,
    'recovery': 60,
}

VALID_TRANSITIONS = {
    'briefing': ['detection'],
    'detection': ['investigation', 'review'],
    'investigation': ['containment', 'detection'],
    'containment': ['recovery', 'investigation'],
    'recovery': ['review'],
    'review': [],
}

# Phases that contain scripted decision steps (excludes briefing / review).
OPERATIONAL_PHASES = ('detection', 'investigation', 'containment', 'recovery')


def mission_phase_for_step(step_dict, step_index, n_steps):
    """
    Map a scenario step index to an operational mission phase.

    Steps may set ``mission_phase`` explicitly. Otherwise indices are spread
    across OPERATIONAL_PHASES so multi-step scenarios advance phases without
    requiring every step to complete before leaving detection.
    """
    st = step_dict if isinstance(step_dict, dict) else {}
    explicit = st.get('mission_phase')
    if explicit in OPERATIONAL_PHASES:
        return explicit
    if n_steps <= 0:
        return OPERATIONAL_PHASES[0]
    p_count = len(OPERATIONAL_PHASES)
    if n_steps >= p_count:
        if step_index < p_count:
            return OPERATIONAL_PHASES[step_index]
        return OPERATIONAL_PHASES[-1]
    phase_i = min(int(step_index * p_count / n_steps), p_count - 1)
    return OPERATIONAL_PHASES[phase_i]


def indices_for_scenario_phase(steps, phase):
    """0-based step indices whose mission_phase equals ``phase``."""
    if not steps or phase not in OPERATIONAL_PHASES:
        return []
    n = len(steps)
    out = []
    for i, raw in enumerate(steps):
        st = raw if isinstance(raw, dict) else {}
        if mission_phase_for_step(st, i, n) == phase:
            out.append(i)
    return out


def linear_phase_successor(phase):
    """Normal forward progression (timeouts / wrong paths may differ)."""
    return {
        'detection': 'investigation',
        'investigation': 'containment',
        'containment': 'recovery',
        'recovery': 'review',
    }.get(phase)


class MissionPhase(str, Enum):
    BRIEFING = 'briefing'
    DETECTION = 'detection'
    INVESTIGATION = 'investigation'
    CONTAINMENT = 'containment'
    RECOVERY = 'recovery'
    REVIEW = 'review'


class MissionStateMachine:

    def __init__(self, current_phase, scenario_config=None):
        self.current_phase = current_phase
        self.scenario_config = scenario_config or {}

    def transition(self, target_phase, action_data=None):
        """
        Validate and execute a phase transition.
        Returns (new_phase, is_valid, reason, side_effects)
        side_effects dict can contain:
          trigger_escalation: bool
          reduce_score: int
          add_threat: dict
        """
        allowed = VALID_TRANSITIONS.get(self.current_phase, [])
        if target_phase not in allowed:
            return (
                self.current_phase,
                False,
                f"Cannot transition from {self.current_phase} to "
                f"{target_phase}. Allowed: {allowed}",
                {}
            )
        side_effects = {}
        # Wrong action in detection sends back to detection
        if (self.current_phase == 'investigation' and
                target_phase == 'detection'):
            side_effects['trigger_escalation'] = True
            side_effects['reduce_score'] = 10
        self.current_phase = target_phase
        return (target_phase, True, 'Transition successful', side_effects)

    def is_timed_out(self, phase_started_at, custom_limits=None):
        """Returns True if current phase has exceeded its time limit."""
        if phase_started_at is None:
            return False
        limits = custom_limits or PHASE_TIME_LIMITS
        limit = limits.get(self.current_phase)
        if limit is None:
            return False
        now = datetime.now(timezone.utc)
        elapsed = (now - phase_started_at).total_seconds()
        return elapsed > limit

    def get_time_remaining(self, phase_started_at, custom_limits=None):
        """Returns seconds remaining in current phase. 0 if timed out."""
        if phase_started_at is None:
            return None
        limits = custom_limits or PHASE_TIME_LIMITS
        limit = limits.get(self.current_phase)
        if limit is None:
            return None
        now = datetime.now(timezone.utc)
        elapsed = (now - phase_started_at).total_seconds()
        return max(0, limit - elapsed)

