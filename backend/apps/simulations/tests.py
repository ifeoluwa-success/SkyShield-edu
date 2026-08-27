from django.test import SimpleTestCase

from apps.simulations.answer_keys import (
    sanitize_session_state_for_trainee,
    sanitize_step,
    sanitize_steps,
)
from apps.simulations.mission_state import materialize_active_step


class AnswerKeySanitizationTests(SimpleTestCase):
    def test_sanitize_step_strips_answer_keys(self):
        step = {
            'step_id': 's1',
            'title': 'Detect spoofing',
            'correct_action': 'report',
            'options': [
                {'id': 'report', 'text': 'Report', 'is_correct': True},
                {'id': 'ignore', 'text': 'Ignore', 'is_correct': False},
            ],
        }
        cleaned = sanitize_step(step)
        self.assertNotIn('correct_action', cleaned)
        self.assertEqual(cleaned['step_id'], 's1')
        for opt in cleaned['options']:
            self.assertNotIn('is_correct', opt)

    def test_materialize_active_step_omits_correct_action(self):
        steps = [{
            'step_id': 's1',
            'correct_action': 'A',
            'options': [{'id': 'A', 'text': 'A', 'is_correct': True}],
            'hint': 'look closer',
        }]
        active = materialize_active_step(steps, 0)
        self.assertIsNotNone(active)
        self.assertNotIn('correct_action', active)
        self.assertEqual(active['hint'], 'look closer')
        self.assertNotIn('is_correct', active['options'][0])

    def test_sanitize_session_state_strips_is_correct(self):
        state = {
            'current_step': 1,
            'decisions': [
                {'step_id': 's1', 'is_correct': True, 'score_delta': 10},
            ],
        }
        cleaned = sanitize_session_state_for_trainee(state)
        self.assertEqual(cleaned['current_step'], 1)
        self.assertNotIn('is_correct', cleaned['decisions'][0])
        self.assertEqual(cleaned['decisions'][0]['score_delta'], 10)

    def test_sanitize_steps_list(self):
        steps = sanitize_steps([
            {'id': 1, 'correct_actions': ['x'], 'options': []},
        ])
        self.assertNotIn('correct_actions', steps[0])
