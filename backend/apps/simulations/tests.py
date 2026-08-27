from asgiref.sync import async_to_sync
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.test import TestCase, TransactionTestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.simulations.models import (
    IncidentRun,
    MissionParticipant,
    Scenario,
    ScenarioAssignment,
)
from apps.simulations.orchestrator import ScenarioOrchestrator
from config.asgi import application

User = get_user_model()

MEMORY_CHANNEL_LAYERS = {
    'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'},
}


def _make_user(email, role, username=None):
    return User.objects.create_user(
        email=email,
        username=username or email.split('@')[0],
        password='testpass123',
        role=role,
        status='active',
        email_verified=True,
    )


def _make_scenario(title='GPS Spoofing Drill'):
    return Scenario.objects.create(
        title=title,
        description='Training scenario',
        category='navigation',
        threat_type='gps_spoofing',
        difficulty='beginner',
        initial_state={},
        steps=[{'id': 'step-1', 'prompt': 'Identify the spoof'}],
        correct_actions=[],
        learning_objectives=['Detect spoofing'],
        estimated_time=15,
        points_possible=100,
        passing_score=70,
    )


@override_settings(CHANNEL_LAYERS=MEMORY_CHANNEL_LAYERS)
class MissionAuthorizationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.scenario = _make_scenario()
        self.host = _make_user('host@example.com', 'trainee', 'host')
        self.assigned = _make_user('assigned@example.com', 'trainee', 'assigned')
        self.outsider = _make_user('outsider@example.com', 'trainee', 'outsider')
        self.instructor = _make_user('instructor@example.com', 'instructor', 'instructor')
        self.supervisor = _make_user('supervisor@example.com', 'supervisor', 'supervisor')
        self.admin = _make_user('admin@example.com', 'admin', 'admin')

        orch = ScenarioOrchestrator()
        started = orch.start_mission(self.scenario.id, self.host)
        self.run_id = started['run_id']
        self.run = IncidentRun.objects.get(id=self.run_id)

        ScenarioAssignment.objects.create(
            scenario=self.scenario,
            trainee=self.assigned,
            assigned_by=self.supervisor,
            status='assigned',
        )

    def _auth(self, user):
        self.client.force_authenticate(user=user)

    def _join_url(self, run_id=None):
        return f'/api/simulations/incidents/{run_id or self.run_id}/join/'

    def _state_url(self, run_id=None):
        return f'/api/simulations/incidents/{run_id or self.run_id}/state/'

    def test_unauthenticated_http_access_denied(self):
        self.client.force_authenticate(user=None)
        response = self.client.get('/api/simulations/incidents/')
        self.assertEqual(response.status_code, 401)
        response = self.client.post(self._join_url(), {})
        self.assertEqual(response.status_code, 401)
        response = self.client.get(self._state_url())
        self.assertEqual(response.status_code, 401)

    def test_host_can_list_join_and_read_state(self):
        self._auth(self.host)
        listed = self.client.get('/api/simulations/incidents/')
        self.assertEqual(listed.status_code, 200)
        ids = [str(item['id']) for item in listed.data['results']]
        self.assertIn(self.run_id, ids)

        join = self.client.post(self._join_url(), {})
        self.assertEqual(join.status_code, 200)
        self.assertFalse(join.data['joined'])

        state = self.client.get(self._state_url())
        self.assertEqual(state.status_code, 200)
        self.assertIn('run', state.data)

    def test_assigned_trainee_can_join_and_read(self):
        self._auth(self.assigned)
        join = self.client.post(self._join_url(), {'role': 'support_operator'})
        self.assertEqual(join.status_code, 200)
        self.assertTrue(join.data['joined'])
        self.assertTrue(
            MissionParticipant.objects.filter(run=self.run, user=self.assigned).exists()
        )

        state = self.client.get(self._state_url())
        self.assertEqual(state.status_code, 200)

        events = self.client.get(f'/api/simulations/incidents/{self.run_id}/events/')
        self.assertEqual(events.status_code, 200)
        participants = self.client.get(
            f'/api/simulations/incidents/{self.run_id}/participants/'
        )
        self.assertEqual(participants.status_code, 200)

    def test_supervisor_and_admin_can_access_mission(self):
        for staff in (self.supervisor, self.admin):
            self._auth(staff)
            listed = self.client.get('/api/simulations/incidents/')
            self.assertEqual(listed.status_code, 200)
            ids = [str(item['id']) for item in listed.data['results']]
            self.assertIn(self.run_id, ids)

            state = self.client.get(self._state_url())
            self.assertEqual(state.status_code, 200)

            join = self.client.post(self._join_url(), {'role': 'supervisor'})
            self.assertEqual(join.status_code, 200)

    def test_unauthorized_trainee_is_denied(self):
        self._auth(self.outsider)
        listed = self.client.get('/api/simulations/incidents/')
        self.assertEqual(listed.status_code, 200)
        ids = [str(item['id']) for item in listed.data['results']]
        self.assertNotIn(self.run_id, ids)

        join = self.client.post(self._join_url(), {})
        self.assertEqual(join.status_code, 404)
        self.assertFalse(
            MissionParticipant.objects.filter(run=self.run, user=self.outsider).exists()
        )

        state = self.client.get(self._state_url())
        self.assertEqual(state.status_code, 404)
        events = self.client.get(f'/api/simulations/incidents/{self.run_id}/events/')
        self.assertEqual(events.status_code, 404)
        timeline = self.client.get(f'/api/simulations/incidents/{self.run_id}/timeline/')
        self.assertEqual(timeline.status_code, 404)
        score = self.client.get(f'/api/simulations/incidents/{self.run_id}/score/')
        self.assertEqual(score.status_code, 404)
        participants = self.client.get(
            f'/api/simulations/incidents/{self.run_id}/participants/'
        )
        self.assertEqual(participants.status_code, 404)

    def test_unauthorized_instructor_is_denied(self):
        self._auth(self.instructor)
        join = self.client.post(self._join_url(), {})
        self.assertEqual(join.status_code, 404)
        state = self.client.get(self._state_url())
        self.assertEqual(state.status_code, 404)
        self.assertFalse(
            MissionParticipant.objects.filter(run=self.run, user=self.instructor).exists()
        )

    def test_existing_participant_can_rejoin(self):
        MissionParticipant.objects.create(
            run=self.run,
            user=self.outsider,
            role='support_operator',
        )
        self._auth(self.outsider)
        join = self.client.post(self._join_url(), {})
        self.assertEqual(join.status_code, 200)
        self.assertFalse(join.data['joined'])

    def test_host_start_mission_still_works(self):
        self._auth(self.host)
        response = self.client.post(
            '/api/simulations/incidents/',
            {'scenario_id': str(self.scenario.id)},
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertIn('run_id', response.data)
        self.assertIn('ws_url', response.data)


@override_settings(CHANNEL_LAYERS=MEMORY_CHANNEL_LAYERS)
class MissionWebSocketAuthorizationTests(TransactionTestCase):
    def setUp(self):
        self.scenario = _make_scenario('WS Drill')
        self.host = _make_user('wshost@example.com', 'trainee', 'wshost')
        self.outsider = _make_user('wsoutsider@example.com', 'trainee', 'wsoutsider')
        self.assigned = _make_user('wsassigned@example.com', 'trainee', 'wsassigned')
        started = ScenarioOrchestrator().start_mission(self.scenario.id, self.host)
        self.run_id = started['run_id']
        ScenarioAssignment.objects.create(
            scenario=self.scenario,
            trainee=self.assigned,
            status='assigned',
        )

    def _connect(self, user, run_id=None):
        token = str(AccessToken.for_user(user))
        path = f'/ws/mission/{run_id or self.run_id}/?token={token}'
        communicator = WebsocketCommunicator(application, path)

        async def _run():
            connected, close_code = await communicator.connect()
            payload = None
            if connected:
                try:
                    payload = await communicator.receive_json_from(timeout=2)
                except Exception:
                    payload = None
            await communicator.disconnect()
            return connected, close_code, payload

        return async_to_sync(_run)()

    def test_unauthorized_websocket_is_rejected(self):
        connected, close_code, payload = self._connect(self.outsider)
        self.assertFalse(connected)
        self.assertEqual(close_code, 4003)
        self.assertIsNone(payload)
        self.assertFalse(
            MissionParticipant.objects.filter(
                run_id=self.run_id, user=self.outsider
            ).exists()
        )

    def test_unauthenticated_websocket_is_rejected(self):
        communicator = WebsocketCommunicator(
            application, f'/ws/mission/{self.run_id}/'
        )

        async def _run():
            connected, close_code = await communicator.connect()
            await communicator.disconnect()
            return connected, close_code

        connected, close_code = async_to_sync(_run)()
        self.assertFalse(connected)
        self.assertEqual(close_code, 4001)

    def test_authorized_host_websocket_succeeds(self):
        connected, _close_code, payload = self._connect(self.host)
        self.assertTrue(connected)
        self.assertIsNotNone(payload)
        self.assertEqual(payload.get('type'), 'connection_confirmed')

    def test_assigned_trainee_websocket_succeeds(self):
        connected, _close_code, payload = self._connect(self.assigned)
        self.assertTrue(connected)
        self.assertIsNotNone(payload)
        self.assertEqual(payload.get('type'), 'connection_confirmed')
        self.assertTrue(
            MissionParticipant.objects.filter(
                run_id=self.run_id, user=self.assigned
            ).exists()
        )
