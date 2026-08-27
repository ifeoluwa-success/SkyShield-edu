from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Scenario, SimulationSession

User = get_user_model()


class SimulationSessionReadOnlyTests(APITestCase):
    """Sessions expose list/retrieve + controlled actions; CRUD writes are blocked."""

    def setUp(self):
        self.user = User.objects.create_user(
            email='trainee@example.com',
            username='trainee',
            password='SecurePass1',
            status='active',
            email_verified=True,
        )
        self.client.force_authenticate(user=self.user)
        self.scenario = Scenario.objects.create(
            title='GPS Spoofing Drill',
            description='Practice detecting spoofed coordinates.',
            category='navigation',
            threat_type='gps_spoofing',
            difficulty='beginner',
            initial_state={'phase': 'briefing'},
            steps=[
                {
                    'title': 'Assess instruments',
                    'description': 'Choose the safest next step.',
                    'options': [{'id': 'cross_check', 'label': 'Cross-check NAV sources'}],
                    'correct_actions': ['cross_check'],
                    'hints': ['Compare GPS with inertial data.'],
                    'feedback': {'correct': 'Good.', 'incorrect': 'Try again.'},
                }
            ],
            correct_actions=['cross_check'],
            learning_objectives=['Detect spoofing'],
            estimated_time=15,
        )
        self.session = SimulationSession.objects.create(
            user=self.user,
            scenario=self.scenario,
            status='in_progress',
            session_state=self.scenario.initial_state,
            attempt_number=1,
        )

    def test_list_and_retrieve_are_allowed(self):
        list_url = reverse('session-list')
        detail_url = reverse('session-detail', kwargs={'pk': self.session.pk})

        list_response = self.client.get(list_url)
        detail_response = self.client.get(detail_url)

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_response.status_code, status.HTTP_200_OK)
        self.assertEqual(str(detail_response.data['id']), str(self.session.pk))

    def test_direct_create_update_delete_are_rejected(self):
        list_url = reverse('session-list')
        detail_url = reverse('session-detail', kwargs={'pk': self.session.pk})

        create_response = self.client.post(
            list_url,
            {
                'scenario': str(self.scenario.pk),
                'status': 'in_progress',
            },
            format='json',
        )
        put_response = self.client.put(
            detail_url,
            {'status': 'completed'},
            format='json',
        )
        patch_response = self.client.patch(
            detail_url,
            {'status': 'abandoned'},
            format='json',
        )
        delete_response = self.client.delete(detail_url)

        self.assertEqual(create_response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertEqual(put_response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertEqual(patch_response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertEqual(delete_response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_start_and_submit_decision_actions_remain_available(self):
        start_url = reverse('session-start')
        start_response = self.client.post(
            start_url,
            {'scenario_id': str(self.scenario.pk)},
            format='json',
        )
        self.assertEqual(start_response.status_code, status.HTTP_200_OK)
        self.assertEqual(str(start_response.data['id']), str(self.session.pk))

        submit_url = reverse('session-submit-decision')
        submit_response = self.client.post(
            submit_url,
            {
                'session_id': str(self.session.pk),
                'step_number': 0,
                'decision_type': 'choice',
                'decision_data': {'id': 'cross_check'},
                'time_taken': 12,
            },
            format='json',
        )
        self.assertEqual(submit_response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            submit_response.data.get('completed')
            or submit_response.data.get('correct') is not None
        )
