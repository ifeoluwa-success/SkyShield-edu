"""Reusable JSON builders for scenarios and exercises."""
from __future__ import annotations

import random


def scenario_steps(rng: random.Random, step_count: int = 4) -> list[dict]:
    steps = []
    for i in range(step_count):
        correct = f'opt_correct_{i}'
        steps.append({
            'step_id': f'step-{i + 1}',
            'title': f'Operational decision {i + 1}',
            'description': (
                'Anomalous indicators require a documented response. '
                'Select the action aligned with ICAO Doc 8973 and local SOP.'
            ),
            'step_number': i,
            'time_limit_seconds': rng.choice([90, 120, 180]),
            'options': [
                {'id': correct, 'label': 'Escalate per SOP and log the event'},
                {'id': f'opt_delay_{i}', 'label': 'Wait for secondary confirmation only'},
                {'id': f'opt_ignore_{i}', 'label': 'Dismiss as sensor noise'},
            ],
            'correct_actions': [correct],
            'correct_action': correct,
            'hint': 'Early escalation reduces blast radius for navigation-security incidents.',
            'feedback': {'success': 'Correct — protocol followed.', 'failure': 'Review escalation matrix.'},
        })
    return steps


def scenario_payload(rng: random.Random, title: str, threat_type: str, category: str) -> dict:
    steps = scenario_steps(rng)
    return {
        'title': title,
        'description': (
            f'Live-training scenario: {title}. Trainees practice detection, containment, '
            'and recovery in a West African ATM/AVSEC context.'
        ),
        'category': category,
        'threat_type': threat_type,
        'difficulty': rng.choice(['beginner', 'intermediate', 'advanced', 'expert']),
        'initial_state': {'phase': 'briefing', 'alerts': [], 'severity': rng.randint(2, 4)},
        'steps': steps,
        'correct_actions': [s['correct_actions'][0] for s in steps],
        'hints': ['Coordinate with supervisor', 'Preserve event logs'],
        'learning_objectives': [
            'Identify indicators of compromise',
            'Apply escalation procedures',
            'Document decisions for audit',
        ],
        'graph': {},
        'escalation_rules': [],
        'estimated_time': rng.choice([15, 20, 25, 30]),
        'points_possible': 100,
        'passing_score': rng.choice([70, 72, 75, 78]),
        'max_attempts': 3,
        'is_active': True,
        'is_featured': rng.random() < 0.15,
        'requires_team_participation': rng.random() < 0.2,
        'tags': [threat_type, category, 'west-africa'],
    }


def exercise_questions(rng: random.Random) -> tuple[list, list, dict]:
    questions = []
    answers = []
    for i in range(rng.randint(3, 6)):
        qid = f'q{i + 1}'
        correct = f'{qid}_b'
        questions.append({
            'id': qid,
            'text': f'Which action is appropriate when anomaly {i + 1} is confirmed on shift?',
            'options': [
                {'id': f'{qid}_a', 'text': 'Ignore until handover'},
                {'id': f'{qid}_b', 'text': 'Escalate and document per SOP'},
                {'id': f'{qid}_c', 'text': 'Reset systems without logging'},
            ],
        })
        answers.append({'question_id': qid, 'correct_option': correct})
    explanations = {a['question_id']: 'SOP requires immediate escalation and audit trail.' for a in answers}
    return questions, answers, explanations
