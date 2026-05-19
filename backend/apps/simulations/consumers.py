import asyncio
import logging
from datetime import timedelta

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from django.conf import settings
from django.contrib.auth.models import AnonymousUser
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken

from .orchestrator import (
    ScenarioOrchestrator,
    MissionNotFound,
    UnauthorizedAction,
    MissionAlreadyComplete,
    PhaseTimedOut,
)
from .models import IncidentRun, MissionParticipant
from .state_machine import MissionStateMachine
from .ws_support import channel_safe, is_client_disconnect, log_client_disconnect, peer_from_scope
from .ws_channel import ensure_channel_layer, redis_ping

logger = logging.getLogger(__name__)

PING_INTERVAL_S = getattr(settings, 'MISSION_WS_PING_INTERVAL_SECONDS', 25)
# 4006 = replaced by a newer socket (tab refresh); not auth failure (4001).
EVICT_CLOSE_CODE = 4006


class MissionConsumer(AsyncJsonWebsocketConsumer):
    """
    Real-time mission state channel for simulation runs.
    URL: ws/mission/<run_id>/
    Auth: JWT token in ?token= query string
    Group: mission_{run_id}

    Reconnect contract:
      1. Old socket is evicted (same user, same run) via socket_evict group message.
      2. connect() sends connection_confirmed with full mission state (direct to socket).
      3. Group membership is optional when Redis is down — state still rehydrates.
    """

    async def connect(self):
        self._timer_task = None
        self._ping_task = None
        self._accepted = False
        self._cleaned_up = False

        self.user = await self.get_user_from_token()
        if not self.user or isinstance(self.user, AnonymousUser):
            await self.close(code=4001)
            return

        run_id = self.scope['url_route']['kwargs']['run_id']
        self.run = await self.get_run(run_id)
        if not self.run:
            await self.close(code=4004)
            return

        self.run_id = str(run_id)
        self.group_name = f'mission_{self.run_id}'
        self._peer = peer_from_scope(self.scope)

        await self.accept()
        self._accepted = True

        orchestrator = ScenarioOrchestrator()
        try:
            await database_sync_to_async(orchestrator.join_mission)(
                str(run_id), self.user, 'support_operator', broadcast=False
            )
        except MissionAlreadyComplete:
            logger.info(
                'mission.ws_connect_denied_ended run_id=%s user_id=%s',
                run_id,
                self.user.pk,
            )
            await self.close(code=4005)
            return
        except MissionNotFound:
            await self.close(code=4004)
            return

        self.participant = await self.get_participant(run_id, self.user.id)
        if not self.participant:
            await self.close(code=4004)
            return

        self.participant_id = str(self.participant.id)

        self._channel_ok = await self._try_join_group()

        await self._send_connection_confirmed(reason='connect')

        if self._channel_ok:
            asyncio.create_task(self._evict_stale_sockets_for_user())

        if self._channel_ok:
            try:
                await self.channel_layer.group_send(
                    self.group_name,
                    channel_safe(
                        {
                            'type': 'mission_event',
                            'event': {
                                'event_type': 'participant_joined',
                                'username': self.user.username,
                                'user_id': self.user.pk,
                            },
                        }
                    ),
                )
            except Exception as exc:
                logger.warning(
                    'mission.ws_participant_joined_broadcast_failed run_id=%s: %s',
                    self.run_id,
                    exc,
                )

        self._timer_task = asyncio.create_task(self._schedule_timer_warning())
        self._ping_task = asyncio.create_task(self._server_ping_loop())

        logger.info(
            'mission.ws_connected run_id=%s user_id=%s participant_id=%s channel_ok=%s',
            self.run_id,
            self.user.pk,
            self.participant_id,
            self._channel_ok,
        )

    async def _try_join_group(self) -> bool:
        try:
            await ensure_channel_layer()
            await self.channel_layer.group_add(self.group_name, self.channel_name)
            return True
        except Exception as exc:
            logger.warning(
                'mission.ws_group_add_skipped run_id=%s user_id=%s redis_ping=%s err=%s',
                getattr(self, 'run_id', '-'),
                getattr(self.user, 'pk', '-'),
                redis_ping(),
                exc,
            )
            return False

    async def _evict_stale_sockets_for_user(self):
        """Close older sockets for this user on the same run (tab refresh / reconnect)."""
        try:
            await self.channel_layer.group_send(
                self.group_name,
                channel_safe(
                    {
                        'type': 'socket_evict',
                        'user_id': self.user.pk,
                        'keep_channel': self.channel_name,
                    }
                ),
            )
        except Exception as exc:
            logger.debug('mission.socket_evict_send_failed: %s', exc)

    async def socket_evict(self, event):
        """Drop duplicate connections for the same user (keep the newest channel)."""
        if not getattr(self, '_accepted', False):
            return
        if str(event.get('user_id')) != str(self.user.pk):
            return
        if event.get('keep_channel') == self.channel_name:
            return
        logger.info(
            'mission.ws_evicting_stale_socket run_id=%s user_id=%s old_channel=%s',
            getattr(self, 'run_id', '-'),
            self.user.pk,
            self.channel_name,
        )
        try:
            await self.close(code=EVICT_CLOSE_CODE)
        except Exception:
            pass

    async def disconnect(self, code):
        await self._cleanup(code=code)

    async def _group_discard_safe(self, group_name: str) -> None:
        try:
            await asyncio.wait_for(
                self.channel_layer.group_discard(group_name, self.channel_name),
                timeout=2.0,
            )
        except Exception as exc:
            if not is_client_disconnect(exc):
                logger.debug('mission.ws_group_discard_failed: %s', exc)

    async def _cleanup(self, code=None):
        if getattr(self, '_cleaned_up', False):
            return
        self._cleaned_up = True

        for attr in ('_timer_task', '_ping_task'):
            try:
                task = getattr(self, attr, None)
                if task:
                    task.cancel()
            except Exception:
                pass

        group_name = getattr(self, 'group_name', None)
        if group_name and getattr(self, '_channel_ok', False):
            asyncio.create_task(self._group_discard_safe(group_name))

        if hasattr(self, 'run_id') and hasattr(self, 'user') and self.user:
            asyncio.create_task(self.mark_participant_disconnected(self.run_id, self.user.id))

        logger.info(
            'mission.ws_disconnected run_id=%s user_id=%s participant_id=%s code=%s',
            getattr(self, 'run_id', '-'),
            getattr(self.user, 'pk', '-'),
            getattr(self, 'participant_id', '-'),
            code,
        )

    async def receive_json(self, content):
        try:
            msg_type = (content or {}).get('type')
            handlers = {
                'submit_action': self.handle_submit_action,
                'acknowledge_briefing': self.handle_acknowledge_briefing,
                'request_hint': self.handle_request_hint,
                'abandon': self.handle_abandon,
                'supervisor_intervention': self.handle_supervisor_intervention,
                'get_state': self._handle_get_state,
                'heartbeat': self.handle_heartbeat,
                'pong': self.handle_pong,
            }
            handler = handlers.get(msg_type)
            if handler:
                await handler(content or {})
            elif msg_type == 'ping':
                await self.handle_pong(content or {})
            else:
                await self.safe_send_json({'type': 'error', 'message': 'Unknown message type'})
        except Exception as e:
            if is_client_disconnect(e):
                self._log_disconnect(e, detail='receive_json')
                return
            logger.error(
                'mission.ws_message_error run_id=%s user_id=%s: %s',
                getattr(self, 'run_id', '-'),
                getattr(self.user, 'pk', '-'),
                e,
            )

    async def _server_ping_loop(self):
        try:
            while True:
                await asyncio.sleep(PING_INTERVAL_S)
                sent = await self.safe_send_json({
                    'type': 'ping',
                    'ts': timezone.now().isoformat(),
                    'run_id': getattr(self, 'run_id', None),
                })
                if not sent:
                    break
        except asyncio.CancelledError:
            return
        except Exception as exc:
            if is_client_disconnect(exc):
                self._log_disconnect(exc, detail='ping_loop')
            else:
                logger.debug('mission.ws_ping_loop_end', exc_info=True)

    async def _send_connection_confirmed(self, reason='connect'):
        orchestrator = ScenarioOrchestrator()
        state = await database_sync_to_async(
            lambda: orchestrator.get_current_state(self.run_id, trim_session=True)
        )()
        payload = channel_safe({
            'type': 'connection_confirmed',
            'state': state,
            'reason': reason,
            'run_id': self.run_id,
            'user_id': self.user.pk,
            'channel_layer_ok': getattr(self, '_channel_ok', False),
        })
        await self.safe_send_json(payload)

    async def safe_send_json(self, content) -> bool:
        if not getattr(self, '_accepted', False):
            return False
        try:
            await self.send_json(content)
            return True
        except Exception as exc:
            if is_client_disconnect(exc):
                self._log_disconnect(exc, detail='send_json')
                return False
            raise

    def _log_disconnect(self, exc, detail=None):
        log_client_disconnect(
            channel='websocket',
            exc=exc,
            run_id=getattr(self, 'run_id', None),
            participant_id=getattr(self, 'participant_id', None),
            user_id=str(self.user.pk) if getattr(self, 'user', None) else None,
            peer=getattr(self, '_peer', None),
            detail=detail,
        )

    async def handle_submit_action(self, content):
        orchestrator = ScenarioOrchestrator()
        payload = content.get('payload') or content
        try:
            result = await database_sync_to_async(orchestrator.submit_action)(
                self.run_id, self.user, payload
            )
        except PhaseTimedOut:
            if getattr(self, '_channel_ok', False):
                await self.channel_layer.group_send(
                    self.group_name,
                    channel_safe(
                        {
                            'type': 'mission_event',
                            'event': {
                                'event_type': 'timeout_occurred',
                                'phase': getattr(self.run, 'phase', None),
                            },
                        }
                    ),
                )
            return
        except UnauthorizedAction:
            await self.safe_send_json({'type': 'error', 'message': 'Unauthorized'})
            return
        except (MissionNotFound, MissionAlreadyComplete) as e:
            await self.safe_send_json({'type': 'error', 'message': str(e)})
            return

        await self.safe_send_json({'type': 'action_received', 'data': result})

    async def handle_supervisor_intervention(self, content):
        if getattr(self.user, 'role', None) not in ['supervisor', 'admin']:
            await self.safe_send_json({'type': 'error', 'message': 'Unauthorized'})
            await self.close(code=4003)
            return

        orchestrator = ScenarioOrchestrator()
        intervention_type = content.get('intervention_type') or (content.get('payload') or {}).get('type')
        data = content.get('data') or (content.get('payload') or {}).get('data') or {}
        await database_sync_to_async(orchestrator.apply_supervisor_intervention)(
            self.run_id, self.user, intervention_type, data
        )

    async def handle_acknowledge_briefing(self, content):
        orchestrator = ScenarioOrchestrator()
        result = await database_sync_to_async(orchestrator.acknowledge_briefing)(
            self.run_id, self.user
        )
        await self.safe_send_json({'type': 'acknowledge_result', 'data': result})

    async def handle_request_hint(self, content):
        orchestrator = ScenarioOrchestrator()
        result = await database_sync_to_async(orchestrator.request_hint)(self.run_id, self.user)
        await self.safe_send_json({'type': 'hint', 'data': result})

    async def handle_abandon(self, content):
        orchestrator = ScenarioOrchestrator()
        result = await database_sync_to_async(orchestrator.abandon_mission)(self.run_id, self.user)
        await self.safe_send_json({'type': 'abandoned', 'data': result})

    async def _handle_get_state(self, content):
        await self._send_connection_confirmed(reason='get_state')

    async def handle_heartbeat(self, content):
        orchestrator = ScenarioOrchestrator()
        await database_sync_to_async(orchestrator.touch_participant_heartbeat)(
            self.run_id, self.user
        )
        await self.safe_send_json({'type': 'heartbeat_ack', 'ok': True})

    async def handle_pong(self, content):
        orchestrator = ScenarioOrchestrator()
        await database_sync_to_async(orchestrator.touch_participant_heartbeat)(
            self.run_id, self.user
        )
        await self.safe_send_json({
            'type': 'pong_ack',
            'ok': True,
            'ts': timezone.now().isoformat(),
        })

    async def _schedule_timer_warning(self):
        try:
            run = await self.get_run(self.run_id)
            if not run:
                return
            sm = MissionStateMachine(run.phase)
            remaining = sm.get_time_remaining(run.phase_started_at)
            if remaining is None:
                return
            if remaining <= 15:
                if getattr(self, '_channel_ok', False):
                    await self.channel_layer.group_send(
                        self.group_name,
                        channel_safe(
                            {
                                'type': 'timer_warning',
                                'seconds_remaining': int(remaining),
                                'phase': run.phase,
                            }
                        ),
                    )
                return
            await asyncio.sleep(max(0, remaining - 15))
            run = await self.get_run(self.run_id)
            if not run:
                return
            if getattr(self, '_channel_ok', False):
                await self.channel_layer.group_send(
                    self.group_name,
                    channel_safe(
                        {
                            'type': 'timer_warning',
                            'seconds_remaining': 15,
                            'phase': run.phase,
                        }
                    ),
                )
        except asyncio.CancelledError:
            return
        except Exception:
            return

    async def mission_event(self, event):
        await self.safe_send_json({'type': 'mission_event', 'event': event['event']})

    async def state_update(self, event):
        await self.safe_send_json({'type': 'state_update', 'data': event['data']})
        phase = (event.get('data') or {}).get('phase')
        if phase and phase not in ('briefing', 'review'):
            try:
                if self._timer_task:
                    self._timer_task.cancel()
            except Exception:
                pass
            self._timer_task = asyncio.create_task(self._schedule_timer_warning())

    async def participants_updated(self, event):
        await self.safe_send_json(
            {
                'type': 'participants_updated',
                'participants': event.get('participants') or [],
            }
        )

    async def timer_warning(self, event):
        await self.safe_send_json(
            {
                'type': 'timer_warning',
                'seconds_remaining': event['seconds_remaining'],
                'phase': event['phase'],
            }
        )

    @database_sync_to_async
    def get_user_from_token(self):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        try:
            qs = self.scope['query_string'].decode()
            params = dict(p.split('=') for p in qs.split('&') if '=' in p)
            token = params.get('token')
            if not token:
                return AnonymousUser()
            payload = AccessToken(token)
            return User.objects.get(id=payload['user_id'])
        except Exception:
            return AnonymousUser()

    @database_sync_to_async
    def get_run(self, run_id):
        try:
            return IncidentRun.objects.select_related('scenario').get(id=run_id)
        except IncidentRun.DoesNotExist:
            return None

    @database_sync_to_async
    def get_participant(self, run_id, user_id):
        try:
            return MissionParticipant.objects.select_related('user').get(
                run_id=run_id, user_id=user_id
            )
        except MissionParticipant.DoesNotExist:
            return None

    @database_sync_to_async
    def mark_participant_disconnected(self, run_id, user_id):
        try:
            stale = timezone.now() - timedelta(seconds=120)
            MissionParticipant.objects.filter(run_id=run_id, user_id=user_id).update(
                last_heartbeat=stale
            )
        except Exception:
            return
