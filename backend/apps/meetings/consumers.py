# consumers.py  — fully fixed
import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken
from .models import Meeting, MeetingParticipant

logger = logging.getLogger(__name__)


class MeetingConsumer(AsyncWebsocketConsumer):

    # =========================================================================
    # CONNECT / DISCONNECT 
    # =========================================================================

    async def connect(self):
        self.room_name = self.scope['url_route']['kwargs']['room_name']
        self.room_group_name = f'meeting_{self.room_name}'

        # ── Auth ──────────────────────────────────────────────────────────────
        self.user = await self.get_user_from_token()
        if not self.user or isinstance(self.user, AnonymousUser):
            await self.close(code=4001)
            return

        # ── Meeting ───────────────────────────────────────────────────────────
        self.meeting = await self.get_meeting()
        if not self.meeting:
            await self.close(code=4004)
            return

        # ── Waiting-room logic ────────────────────────────────────────────────
        # Host OR non-trainee roles bypass the waiting room entirely.
        is_host = await self.is_host()
        user_role = await self.get_user_role()
        waiting_room_on = await self.get_waiting_room_enabled()

        self.is_host = is_host
        bypass_waiting = is_host or user_role != 'trainee'
        initial_status = 'connected' if (not waiting_room_on or bypass_waiting) else 'waiting'

        # ── Participant record ─────────────────────────────────────────────────
        self.participant = await self.get_or_create_participant(initial_status)
        if not self.participant:
            await self.close(code=4003)
            return

        # ── Join channel layer group & accept ─────────────────────────────────
        self._channel_ok = True
        try:
            if self.channel_layer:
                await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        except Exception as exc:
            self._channel_ok = False
            logger.warning(
                'meeting.ws_group_add_skipped room=%s user_id=%s err=%s',
                self.room_name,
                getattr(self.user, 'pk', '-'),
                exc,
            )

        await self.accept()

        # ── BUG FIX: always save channel_name right after accept() ────────────
        # Without this, direct channel_layer.send() to this participant silently
        # fails because channel_name is never persisted in the DB.
        await self.save_channel_name()

        if initial_status == 'connected':
            await self.mark_participant_connected()

            # Tell the newly joined user who else is already in the room
            participants = await self.get_active_participants()
            await self.send(text_data=json.dumps({
                'type': 'room_info',
                'participants': participants,
                'meeting': {
                    'id': str(self.meeting.id),
                    'title': self.meeting.title,
                    'host': str(await self.get_host_id()),
                    'allow_chat': await self.get_allow_chat(),
                    'allow_screen_share': await self.get_allow_screen_share(),
                }
            }))

            # Tell everyone else that this user joined
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'user_joined',
                    'user_id': str(self.user.id),
                    'username': self.user.username,
                    'full_name': self.user.get_full_name() or self.user.username,
                    'participant_id': str(self.participant.id),
                    'role': initial_status,
                }
            )
        else:
            # Trainee is in waiting room — notify host
            await self.notify_host_waiting_update()
            # Let the trainee know they are waiting
            await self.send(text_data=json.dumps({
                'type': 'waiting',
                'message': 'You are in the waiting room. The host will admit you shortly.',
            }))

    async def disconnect(self, close_code):
        if not hasattr(self, 'room_group_name') or not hasattr(self, 'user'):
            return

        if hasattr(self, 'participant') and self.participant:
            status = await self.get_participant_status()

            if status == 'connected':
                await self.mark_participant_disconnected()
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'user_left',
                        'user_id': str(self.user.id),
                        'username': self.user.username,
                    }
                )
            elif status == 'waiting':
                await self.delete_participant()
                await self.notify_host_waiting_update()

        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    # =========================================================================
    # RECEIVE — MESSAGE ROUTER
    # =========================================================================

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            message_type = data.get('type')

            handlers = {
                'offer':         self.handle_offer,
                'answer':        self.handle_answer,
                'ice_candidate': self.handle_ice_candidate,
                'chat':          self.handle_chat,
                'admit':         self.handle_admit,
                'leave':         self.handle_leave,
                'get_participants': self.handle_get_participants,
                'media_state':   self.handle_media_state,
                'screen_share':  self.handle_screen_share,
                'media_ready':   self.handle_media_ready,
            }

            handler = handlers.get(message_type)
            if handler:
                await handler(data)
            else:
                logger.warning(f"Unknown message type: {message_type}")

        except Exception as e:
            logger.error(f"Error handling message: {e}")

    # =========================================================================
    # WAITING ROOM
    # =========================================================================

    async def handle_admit(self, data):
        """Host admits a waiting participant into the meeting."""
        if not self.is_host:
            return

        participant_id = data.get('participant_id')
        if not participant_id:
            return

        waiting_p = await self.get_waiting_participant(participant_id)
        if not waiting_p:
            return

        # Move them from waiting → connected
        await self.admit_participant_in_db(waiting_p)

        # ── BUG FIX: channel_name is stored in DB at connect time now,
        # so this direct send will actually reach the trainee's browser. ──────
        channel = await self.get_participant_channel(waiting_p)
        if channel:
            await self.channel_layer.send(
                channel,
                {
                    'type': 'admitted',
                    'message': 'You have been admitted to the meeting.',
                }
            )

        # Broadcast to the group that a new user joined
        user_info = await self.get_participant_user_info(waiting_p)
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'user_joined',
                'user_id': user_info['user_id'],
                'username': user_info['username'],
                'full_name': user_info['full_name'],
                'participant_id': str(waiting_p.id),
                'role': 'participant',
            }
        )

        # Refresh waiting list for host
        await self.notify_host_waiting_update()

    async def handle_leave(self, data):
        """Client is leaving the meeting room."""
        if getattr(self, 'participant', None) and self.participant:
            status = await self.get_participant_status()
            if status == 'connected':
                await self.mark_participant_disconnected()
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'user_left',
                        'user_id': str(self.user.id),
                        'username': self.user.username,
                    },
                )
            elif status == 'waiting':
                await self.delete_participant()
                await self.notify_host_waiting_update()

    async def handle_get_participants(self, data):
        """Called by a freshly admitted trainee to get the current participant list."""
        status = await self.get_participant_status()
        if status != 'connected':
            return
        participants = await self.get_active_participants()
        await self.send(text_data=json.dumps({
            'type': 'participant_list',
            'participants': participants,
        }))

    async def notify_host_waiting_update(self):
        """Push updated waiting list directly to the host's channel."""
        waiting = await self.get_waiting_participants()
        waiting_list = [
            {'id': str(p.id), 'name': p.user.get_full_name() or p.user.username}
            for p in waiting
        ]

        host_channel = await self.get_host_channel()
        if host_channel:
            await self.channel_layer.send(
                host_channel,
                {
                    'type': 'waiting_room_update',
                    'waiting_participants': waiting_list,
                }
            )

    # =========================================================================
    # WebRTC SIGNALING
    # BUG FIX: outgoing event type must match what the frontend switch() expects.
    # Frontend listens for 'offer', 'answer', 'ice_candidate' — NOT 'webrtc_offer' etc.
    # =========================================================================

    async def _get_target_channel(self, data, field='target'):
        target_user_id = data.get(field)
        if not target_user_id:
            return None
        status = await self.get_participant_status()
        if status != 'connected':
            return None
        return await self.get_channel_name_by_user_id(target_user_id)

    async def handle_offer(self, data):
        target_channel = await self._get_target_channel(data)
        if not target_channel:
            logger.warning(
                'meeting.offer_dropped from=%s target=%s room=%s',
                self.user.id,
                data.get('target'),
                self.room_name,
            )
            return
        await self.channel_layer.send(target_channel, {
            'type': 'relay_offer',          # internal channel layer event name
            'offer': data.get('offer'),
            'from_user': str(self.user.id),
            'from_username': self.user.get_full_name() or self.user.username,
        })

    async def handle_answer(self, data):
        target_channel = await self._get_target_channel(data)
        if not target_channel:
            return
        await self.channel_layer.send(target_channel, {
            'type': 'relay_answer',
            'answer': data.get('answer'),
            'from_user': str(self.user.id),
        })

    async def handle_ice_candidate(self, data):
        target_channel = await self._get_target_channel(data)
        if not target_channel:
            return
        await self.channel_layer.send(target_channel, {
            'type': 'relay_ice',
            'candidate': data.get('candidate'),
            'from_user': str(self.user.id),
        })

    async def handle_media_state(self, data):
        status = await self.get_participant_status()
        if status != 'connected':
            return
        await self.channel_layer.group_send(self.room_group_name, {
            'type': 'media_state',
            'user_id': str(self.user.id),
            'videoEnabled': data.get('videoEnabled'),
            'audioEnabled': data.get('audioEnabled'),
        })

    async def handle_screen_share(self, data):
        status = await self.get_participant_status()
        if status != 'connected':
            return
        await self.channel_layer.group_send(self.room_group_name, {
            'type': 'screen_share',
            'user_id': str(self.user.id),
            'sharing': data.get('sharing', False),
        })

    async def handle_media_ready(self, data):
        """Client has granted camera/mic — tell others to (re)connect WebRTC."""
        status = await self.get_participant_status()
        if status != 'connected':
            return
        await self.channel_layer.group_send(self.room_group_name, {
            'type': 'media_ready_broadcast',
            'user_id': str(self.user.id),
            'username': self.user.username,
            'full_name': self.user.get_full_name() or self.user.username,
        })

    # =========================================================================
    # CHAT
    # =========================================================================

    async def handle_chat(self, data):
        status = await self.get_participant_status()
        if status != 'connected':
            return
        content = data.get('content', '').strip()
        if not content:
            return

        chat = await self.save_chat_message(content)
        await self.channel_layer.group_send(self.room_group_name, {
            'type': 'chat',
            'id': str(chat.id) if chat else None,
            'sender': str(self.user.id),
            'sender_name': self.user.get_full_name() or self.user.username,
            'content': content,
            'timestamp': timezone.now().isoformat(),
        })

    # =========================================================================
    # OUTGOING EVENT HANDLERS
    # These methods are called by channel_layer.send() / group_send().
    # The method name maps to the 'type' field with dots→underscores.
    #
    # BUG FIX: relay_offer → sends JSON with type='offer' so frontend switch()
    # matches correctly. Same pattern for answer and ice_candidate.
    # =========================================================================

    async def relay_offer(self, event):
        await self.send(text_data=json.dumps({
            'type': 'offer',                    # ← what frontend expects
            'offer': event['offer'],
            'from_user': event['from_user'],
            'from_username': event.get('from_username', ''),
        }))

    async def relay_answer(self, event):
        await self.send(text_data=json.dumps({
            'type': 'answer',                   # ← what frontend expects
            'answer': event['answer'],
            'from_user': event['from_user'],
        }))

    async def relay_ice(self, event):
        await self.send(text_data=json.dumps({
            'type': 'ice_candidate',            # ← what frontend expects
            'candidate': event['candidate'],
            'from_user': event['from_user'],
        }))

    async def media_ready_broadcast(self, event):
        if str(self.user.id) == str(event.get('user_id')):
            return
        await self.send(text_data=json.dumps({
            'type': 'media_ready',
            'user_id': event.get('user_id'),
            'username': event.get('username'),
            'full_name': event.get('full_name'),
        }))

    async def user_joined(self, event):
        await self.send(text_data=json.dumps({
            'type': 'user_joined',
            'user_id': event.get('user_id'),
            'username': event.get('username'),
            'full_name': event.get('full_name'),
            'user_name': event.get('username'),
            'participant_id': event.get('participant_id'),
        }))

    async def user_left(self, event):
        await self.send(text_data=json.dumps({
            'type': 'user_left',
            'user_id': event.get('user_id'),
            'username': event.get('username'),
        }))

    async def admitted(self, event):
        await self.send(text_data=json.dumps({
            'type': 'admitted',
            'message': event.get('message', 'You have been admitted to the meeting.'),
        }))

    async def waiting_room_update(self, event):
        await self.send(text_data=json.dumps({
            'type': 'waiting_room_update',
            'waiting_participants': event.get('waiting_participants', []),
        }))

    async def participant_list(self, event):
        await self.send(text_data=json.dumps(event))

    async def chat(self, event):
        await self.send(text_data=json.dumps(event))

    async def media_state(self, event):
        await self.send(text_data=json.dumps(event))

    async def screen_share(self, event):
        await self.send(text_data=json.dumps(event))

    # =========================================================================
    # DATABASE HELPERS
    # =========================================================================

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
    def get_meeting(self):
        try:
            return Meeting.objects.select_related('host').get(room_name=self.room_name)
        except Meeting.DoesNotExist:
            return None

    @database_sync_to_async
    def is_host(self):
        return self.user.id == self.meeting.host_id

    @database_sync_to_async
    def get_host_id(self):
        return str(self.meeting.host_id)

    @database_sync_to_async
    def get_waiting_room_enabled(self):
        return self.meeting.waiting_room_enabled

    @database_sync_to_async
    def get_allow_chat(self):
        return self.meeting.allow_chat

    @database_sync_to_async
    def get_allow_screen_share(self):
        return self.meeting.allow_screen_share

    @database_sync_to_async
    def get_user_role(self):
        # Adjust the attribute name to match your User model field
        return getattr(self.user, 'role', 'trainee')

    @database_sync_to_async
    def get_or_create_participant(self, initial_status):
        try:
            role = 'host' if self.user.id == self.meeting.host_id else 'participant'
            participant, created = MeetingParticipant.objects.get_or_create(
                meeting=self.meeting,
                user=self.user,
                defaults={'role': role, 'status': initial_status},
            )
            if not created:
                participant.status = initial_status
                participant.save(update_fields=['status'])
            return participant
        except Exception as e:
            logger.error(f"get_or_create_participant error: {e}")
            return None

    @database_sync_to_async
    def save_channel_name(self):
        """Persist this connection's channel_name so direct sends work."""
        if self.participant:
            self.participant.channel_name = self.channel_name
            self.participant.save(update_fields=['channel_name'])

    @database_sync_to_async
    def mark_participant_connected(self):
        if self.participant:
            self.participant.channel_name = self.channel_name
            self.participant.is_active = True
            self.participant.joined_at = timezone.now()
            self.participant.status = 'connected'
            self.participant.video_enabled = True
            self.participant.audio_enabled = True
            self.participant.save()
            self.meeting.update_participant_count()

    @database_sync_to_async
    def mark_participant_disconnected(self):
        if self.participant:
            self.participant.leave()

    @database_sync_to_async
    def get_participant_status(self):
        if self.participant:
            self.participant.refresh_from_db(fields=['status'])
            return self.participant.status
        return None

    @database_sync_to_async
    def delete_participant(self):
        if self.participant:
            self.participant.delete()

    @database_sync_to_async
    def get_active_participants(self):
        qs = self.meeting.participants.filter(
            status='connected', is_active=True
        ).select_related('user')
        return [
            {
                'id': str(p.user.id),
                'user_id': str(p.user.id),
                'username': p.user.username,
                'full_name': p.user.get_full_name() or p.user.username,
            }
            for p in qs
            if p.user_id != self.user.id
        ]

    @database_sync_to_async
    def get_waiting_participants(self):
        return list(
            self.meeting.participants.filter(status='waiting').select_related('user')
        )

    @database_sync_to_async
    def get_waiting_participant(self, participant_id):
        try:
            return self.meeting.participants.select_related('user').get(
                id=participant_id, status='waiting'
            )
        except MeetingParticipant.DoesNotExist:
            return None

    @database_sync_to_async
    def admit_participant_in_db(self, participant):
        participant.status = 'connected'
        participant.joined_at = timezone.now()
        participant.is_active = True
        participant.save()

    @database_sync_to_async
    def get_participant_channel(self, participant):
        return participant.channel_name

    @database_sync_to_async
    def get_participant_user_info(self, participant):
        return {
            'user_id': str(participant.user.id),
            'username': participant.user.username,
            'full_name': participant.user.get_full_name() or participant.user.username,
        }

    @database_sync_to_async
    def get_host_channel(self):
        try:
            host_p = self.meeting.participants.get(
                user=self.meeting.host, is_active=True
            )
            return host_p.channel_name
        except MeetingParticipant.DoesNotExist:
            return None

    @database_sync_to_async
    def get_channel_name_by_user_id(self, user_id):
        try:
            p = self.meeting.participants.filter(
                user_id=str(user_id),
                is_active=True,
                status='connected',
            ).first()
            return p.channel_name if p else None
        except Exception as exc:
            logger.warning('get_channel_name_by_user_id failed user_id=%s err=%s', user_id, exc)
            return None

    @database_sync_to_async
    def save_chat_message(self, content):
        try:
            from .models import MeetingChat
            return MeetingChat.objects.create(
                meeting=self.meeting,
                sender=self.user,
                content=content,
                message_type='text',
            )
        except Exception:
            return None