"""
Strip answer-key fields from trainee-facing payloads.

Correct answers stay on the server for scoring; trainees must not receive
`correct_action`, option-level `is_correct`, or equivalent key material.
"""
from __future__ import annotations

from copy import deepcopy
from typing import Any

# Keys that reveal the correct choice or otherwise act as an answer key.
ANSWER_KEY_FIELDS = frozenset({
    'correct_action',
    'correct_actions',
    'correct_answer',
    'correct_answers',
    'expected_action',
    'expected_actions',
    'answer',
    'answers',
    'answer_key',
})


def _strip_option(option: Any) -> Any:
    if not isinstance(option, dict):
        return option
    cleaned = {
        key: value
        for key, value in option.items()
        if key not in ANSWER_KEY_FIELDS and key != 'is_correct'
    }
    return cleaned


def sanitize_step(step: Any) -> Any:
    """Return a copy of a scenario step without answer-key fields."""
    if not isinstance(step, dict):
        return step
    cleaned = {
        key: deepcopy(value)
        for key, value in step.items()
        if key not in ANSWER_KEY_FIELDS
    }
    if 'options' in cleaned and isinstance(cleaned['options'], list):
        cleaned['options'] = [_strip_option(opt) for opt in cleaned['options']]
    return cleaned


def sanitize_steps(steps: Any) -> Any:
    """Sanitize a list (or other) of scenario steps for trainee responses."""
    if not isinstance(steps, list):
        return steps
    return [sanitize_step(step) for step in steps]


def sanitize_decision_record(decision: Any) -> Any:
    """
    Remove answer-key material from a stored decision blob.

    Keeps scoring feedback fields that do not reveal the correct choice id
    ahead of time (e.g. score_delta). Drops `is_correct` from trainee state
    snapshots so clients cannot mine past keys across steps.
    """
    if not isinstance(decision, dict):
        return decision
    cleaned = {
        key: deepcopy(value)
        for key, value in decision.items()
        if key not in ANSWER_KEY_FIELDS and key != 'is_correct'
    }
    return cleaned


def sanitize_session_state_for_trainee(session_state: Any) -> dict:
    """Trim answer keys from session_state before REST/WebSocket delivery."""
    if not isinstance(session_state, dict):
        return {}
    st = dict(session_state)
    decisions = st.get('decisions')
    if isinstance(decisions, list):
        st['decisions'] = [sanitize_decision_record(d) for d in decisions]
    return st
