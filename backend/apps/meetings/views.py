from rest_framework import status, generics, permissions, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from django.utils import timezone
from django.db.models import Exists, OuterRef, Q, Count
from django.shortcuts import get_object_or_404
from django.core.cache import cache
from .models import Meeting, MeetingParticipant, MeetingInvitation, MeetingRecording, MeetingChat
from .serializers import (
    MeetingListSerializer, MeetingDetailSerializer, MeetingCreateSerializer,
    MeetingParticipantSerializer, MeetingInvitationSerializer,
    MeetingRecordingSerializer, MeetingChatSerializer, MeetingActionSerializer,
    MeetingJoinSerializer
)
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiTypes, OpenApiResponse
import logging
import uuid

logger = logging.getLogger(__name__)

class MeetingViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing meetings
    """
    permission_classes = [permissions.IsAuthenticated]
    queryset = Meeting.objects.all()
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Meeting.objects.none()

        user = self.request.user
        if not user.is_authenticated:
            return Meeting.objects.none()

        # Filter meetings based on user role
        if user.role in ['admin', 'supervisor']:
            queryset = Meeting.objects.all()
        else:
            queryset = Meeting.objects.filter(
                Q(host=user) |
                Q(participants__user=user) |
                Q(is_private=False)
            ).distinct()

        # Apply filters
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        meeting_type = self.request.query_params.get('type')
        if meeting_type:
            queryset = queryset.filter(meeting_type=meeting_type)

        from_date = self.request.query_params.get('from_date')
        if from_date:
            queryset = queryset.filter(scheduled_start__gte=from_date)

        to_date = self.request.query_params.get('to_date')
        if to_date:
            queryset = queryset.filter(scheduled_end__lte=to_date)

        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search) |
                Q(description__icontains=search) |
                Q(meeting_code__icontains=search)
            )

        queryset = queryset.select_related('host').prefetch_related('participants')
        if self.action == 'list' and user.is_authenticated:
            from .models import MeetingParticipant

            participant_qs = MeetingParticipant.objects.filter(
                meeting_id=OuterRef('pk'),
                user=user,
            )
            queryset = queryset.annotate(
                _user_is_participant=Exists(participant_qs),
            )
        return queryset

    def get_serializer_class(self):
        if self.action == 'create':
            return MeetingCreateSerializer
        elif self.action in ['retrieve', 'update', 'partial_update']:
            return MeetingDetailSerializer
        return MeetingListSerializer

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

    @extend_schema(
        description="List all accessible meetings",
        parameters=[
            OpenApiParameter('status', OpenApiTypes.STR),
            OpenApiParameter('type', OpenApiTypes.STR),
            OpenApiParameter('from_date', OpenApiTypes.STR),
            OpenApiParameter('to_date', OpenApiTypes.STR),
            OpenApiParameter('search', OpenApiTypes.STR),
        ],
        responses={200: MeetingListSerializer(many=True)}
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @extend_schema(
        description="Create a new meeting",
        request=MeetingCreateSerializer,
        responses={201: MeetingDetailSerializer()}
    )
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        meeting = serializer.save()

        # Auto-add host as participant
        MeetingParticipant.objects.create(
            meeting=meeting,
            user=request.user,
            role='host',
            status='connected'
        )

        # Log activity – fixed import
        from apps.users.models import UserActivity
        UserActivity.objects.create(
            user=request.user,
            activity_type='meeting_created',
            metadata={
                'meeting_id': str(meeting.id),
                'meeting_title': meeting.title,
                'meeting_code': meeting.meeting_code
            }
        )

        return Response(
            MeetingDetailSerializer(meeting, context={'request': request}).data,
            status=status.HTTP_201_CREATED
        )

    @extend_schema(
        description="Get meeting details",
        responses={200: MeetingDetailSerializer()}
    )
    def retrieve(self, request, *args, **kwargs):
        return super().retrieve(request, *args, **kwargs)

    @extend_schema(
        description="Update meeting",
        request=MeetingCreateSerializer,
        responses={200: MeetingDetailSerializer()}
    )
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()

        # Only host can update
        if instance.host != request.user and request.user.role not in ['admin', 'supervisor']:
            return Response(
                {'error': 'Only the host can update this meeting'},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)

        return Response(serializer.data)

    @extend_schema(
        description="Delete meeting",
        responses={204: "No Content"}
    )
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()

        # Only host or admin can delete
        if instance.host != request.user and request.user.role not in ['admin', 'supervisor']:
            return Response(
                {'error': 'Only the host can delete this meeting'},
                status=status.HTTP_403_FORBIDDEN
            )

        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(
        description="Start a meeting",
        responses={200: OpenApiResponse(description="Meeting started")}
    )
    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        meeting = self.get_object()

        # Only host can start
        if meeting.host != request.user:
            return Response(
                {'error': 'Only the host can start this meeting'},
                status=status.HTTP_403_FORBIDDEN
            )

        if meeting.status == 'live':
            return Response(
                {'error': 'Meeting is already live'},
                status=status.HTTP_400_BAD_REQUEST
            )

        meeting.start_meeting()

        return Response({
            'message': 'Meeting started',
            'status': meeting.status
        })

    @extend_schema(
        description="End a meeting",
        responses={200: OpenApiResponse(description="Meeting ended")}
    )
    @action(detail=True, methods=['post'])
    def end(self, request, pk=None):
        meeting = self.get_object()

        # Only host can end
        if meeting.host != request.user:
            return Response(
                {'error': 'Only the host can end this meeting'},
                status=status.HTTP_403_FORBIDDEN
            )

        if meeting.status != 'live':
            return Response(
                {'error': 'Meeting is not live'},
                status=status.HTTP_400_BAD_REQUEST
            )

        meeting.end_meeting()

        return Response({
            'message': 'Meeting ended',
            'duration': meeting.duration_seconds
        })

    @extend_schema(
        description="Join a meeting",
        responses={200: OpenApiResponse(description="Join information")}
    )
    @action(detail=False, methods=['post'], url_path='join')
    def join_meeting(self, request):
        serializer = MeetingJoinSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        meeting_code = serializer.validated_data.get('meeting_code')
        password = serializer.validated_data.get('password', '')
        video_enabled = serializer.validated_data.get('video_enabled', False)
        audio_enabled = serializer.validated_data.get('audio_enabled', False)
        client_info = serializer.validated_data.get('client_info', {})

        # Find meeting
        try:
            meeting = Meeting.objects.get(meeting_code=meeting_code)
        except Meeting.DoesNotExist:
            return Response(
                {'error': 'Meeting not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Check if meeting is joinable
        if meeting.status not in ['scheduled', 'live']:
            return Response(
                {'error': f'Meeting is {meeting.get_status_display()}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check password for private meetings
        if meeting.is_private and meeting.password and meeting.password != password:
            return Response(
                {'error': 'Invalid meeting password'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Check if user is already in meeting
        participant, created = MeetingParticipant.objects.get_or_create(
            meeting=meeting,
            user=request.user,
            defaults={
                'role': 'host' if meeting.host == request.user else 'participant',
                'video_enabled': video_enabled,
                'audio_enabled': audio_enabled,
                'client_info': client_info,
                'status': 'joining'
            }
        )

        if not created and participant.status == 'connected':
            return Response({
                'message': 'Already in meeting',
                'meeting': MeetingDetailSerializer(meeting, context={'request': request}).data,
                'participant': MeetingParticipantSerializer(participant).data,
                'signaling_server': '/ws/meeting/'
            })

        # Check max participants
        if meeting.participant_count >= meeting.max_participants:
            return Response(
                {'error': 'Meeting has reached maximum participants'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Generate WebSocket connection info
        ws_url = f"/ws/meeting/{meeting.room_name}/"

        return Response({
            'message': 'Ready to join',
            'meeting': {
                'id': str(meeting.id),
                'title': meeting.title,
                'code': meeting.meeting_code,
                'room': meeting.room_name,
                'status': meeting.status,
                'host_name': meeting.host.get_full_name() or meeting.host.username,
                'participant_count': meeting.participant_count,
                'max_participants': meeting.max_participants,
                'allow_chat': meeting.allow_chat,
                'allow_screen_share': meeting.allow_screen_share,
                'allow_recording': meeting.allow_recording,
            },
            'participant': {
                'id': str(participant.id),
                'role': participant.role,
                'video_enabled': video_enabled,
                'audio_enabled': audio_enabled,
            },
            'signaling': {
                'websocket_url': ws_url,
                'ice_servers': self.get_ice_servers(),
            }
        })

    @extend_schema(
        description="Get meeting participants",
        responses={200: MeetingParticipantSerializer(many=True)}
    )
    @action(detail=True, methods=['get'])
    def participants(self, request, pk=None):
        meeting = self.get_object()
        participants = meeting.participants.filter(is_active=True)
        serializer = MeetingParticipantSerializer(participants, many=True)
        return Response(serializer.data)

    @extend_schema(
        description="Invite users to meeting",
        responses={200: MeetingInvitationSerializer(many=True)}
    )
    @action(detail=True, methods=['post'])
    def invite(self, request, pk=None):
        meeting = self.get_object()
        user_ids = request.data.get('user_ids', [])
        message = request.data.get('message', '')

        if not user_ids:
            return Response(
                {'error': 'No users specified'},
                status=status.HTTP_400_BAD_REQUEST
            )

        from django.contrib.auth import get_user_model
        User = get_user_model()

        invitations = []
        for user_id in user_ids:
            try:
                user = User.objects.get(id=user_id)

                # Check if already invited
                if MeetingInvitation.objects.filter(
                    meeting=meeting,
                    invited_user=user,
                    status__in=['pending', 'accepted']
                ).exists():
                    continue

                invitation = MeetingInvitation.objects.create(
                    meeting=meeting,
                    invited_user=user,
                    invited_by=request.user,
                    message=message
                )
                invitations.append(invitation)

                # Create notification – fixed import
                from apps.users.models import UserNotification
                UserNotification.objects.create(
                    user=user,
                    type='info',
                    title=f'Meeting Invitation: {meeting.title}',
                    message=f'You have been invited to join "{meeting.title}" by {request.user.get_full_name() or request.user.username}',
                    link=f'/meetings/join/{meeting.meeting_code}/'
                )

            except User.DoesNotExist:
                continue

        serializer = MeetingInvitationSerializer(invitations, many=True)
        return Response(serializer.data)

    @extend_schema(
        description="Request recording",
        responses={202: OpenApiResponse(description="Recording requested")}
    )
    @action(detail=True, methods=['post'])
    def request_recording(self, request, pk=None):
        meeting = self.get_object()

        if not meeting.allow_recording:
            return Response(
                {'error': 'Recording is not allowed for this meeting'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Create recording request
        recording = MeetingRecording.objects.create(
            meeting=meeting,
            requested_by=request.user,
            status='requested'
        )

        # Trigger Celery task for recording
        from .tasks import process_meeting_recording
        task = process_meeting_recording.delay(str(recording.id))

        recording.task_id = task.id
        recording.save()

        return Response({
            'message': 'Recording requested',
            'recording_id': str(recording.id),
            'task_id': task.id
        }, status=status.HTTP_202_ACCEPTED)

    @extend_schema(
        description="Get meeting recordings",
        responses={200: MeetingRecordingSerializer(many=True)}
    )
    @action(detail=True, methods=['get'])
    def recordings(self, request, pk=None):
        meeting = self.get_object()
        recordings = meeting.recordings.all()
        serializer = MeetingRecordingSerializer(recordings, many=True)
        return Response(serializer.data)

    @extend_schema(
        description="Send chat message",
        responses={201: MeetingChatSerializer()}
    )
    @action(detail=True, methods=['post'])
    def chat(self, request, pk=None):
        meeting = self.get_object()

        if not meeting.allow_chat:
            return Response(
                {'error': 'Chat is disabled for this meeting'},
                status=status.HTTP_400_BAD_REQUEST
            )

        content = request.data.get('content')
        recipient_id = request.data.get('recipient_id')
        message_type = request.data.get('message_type', 'text')

        if not content:
            return Response(
                {'error': 'Message content is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check if user is a participant
        try:
            participant = meeting.participants.get(user=request.user, is_active=True)
        except MeetingParticipant.DoesNotExist:
            return Response(
                {'error': 'You must be in the meeting to chat'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Handle private message
        recipient = None
        if recipient_id and message_type == 'private':
            try:
                recipient = meeting.participants.get(id=recipient_id).user
            except:
                return Response(
                    {'error': 'Recipient not found in meeting'},
                    status=status.HTTP_404_NOT_FOUND
                )

        chat = MeetingChat.objects.create(
            meeting=meeting,
            sender=request.user,
            recipient=recipient,
            content=content,
            message_type=message_type
        )

        serializer = MeetingChatSerializer(chat)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(
        description="Get chat history",
        parameters=[
            OpenApiParameter('limit', OpenApiTypes.INT, description='Number of messages to return'),
        ],
        responses={200: MeetingChatSerializer(many=True)}
    )
    @action(detail=True, methods=['get'])
    def chat_history(self, request, pk=None):
        meeting = self.get_object()

        # Get public messages + private messages involving the user
        messages = meeting.chat_messages.filter(
            Q(message_type='text') |
            Q(recipient=request.user) |
            Q(sender=request.user)
        ).exclude(is_deleted=True)

        # Limit
        limit = int(request.query_params.get('limit', 50))
        messages = messages.order_by('-created_at')[:limit]

        serializer = MeetingChatSerializer(messages, many=True)
        return Response(serializer.data)

    def get_ice_servers(self):
        """Get ICE servers for WebRTC"""
        from django.conf import settings

        # Default STUN servers
        ice_servers = [
            {'urls': 'stun:stun.l.google.com:19302'},
            {'urls': 'stun:stun1.l.google.com:19302'},
        ]

        # Add TURN servers if configured
        if hasattr(settings, 'TURN_SERVERS'):
            ice_servers.extend(settings.TURN_SERVERS)

        return ice_servers


class UpcomingMeetingsView(generics.ListAPIView):
    """
    View for upcoming meetings
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = MeetingListSerializer
    queryset = Meeting.objects.all()

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Meeting.objects.none()

        user = self.request.user
        if not user.is_authenticated:
            return Meeting.objects.none()

        now = timezone.now()

        # Get upcoming meetings (hosted or invited)
        return Meeting.objects.filter(
            Q(host=user) | Q(participants__user=user),
            scheduled_start__gte=now,
            status__in=['scheduled', 'live']
        ).distinct().order_by('scheduled_start')[:10]

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context


class MeetingInvitationViewSet(viewsets.ModelViewSet):
    """
    ViewSet for meeting invitations
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = MeetingInvitationSerializer
    queryset = MeetingInvitation.objects.all()
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return MeetingInvitation.objects.none()

        user = self.request.user
        if not user.is_authenticated:
            return MeetingInvitation.objects.none()

        return MeetingInvitation.objects.filter(
            Q(invited_user=user) | Q(invited_by=user)
        ).select_related('meeting', 'invited_user', 'invited_by')

    @extend_schema(
        description="Accept meeting invitation",
        responses={200: OpenApiResponse(description="Invitation accepted")}
    )
    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        invitation = self.get_object()

        if invitation.status != 'pending':
            return Response(
                {'error': f'Invitation is already {invitation.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if invitation.expires_at < timezone.now():
            invitation.status = 'expired'
            invitation.save()
            return Response(
                {'error': 'Invitation has expired'},
                status=status.HTTP_400_BAD_REQUEST
            )

        invitation.status = 'accepted'
        invitation.responded_at = timezone.now()
        invitation.save()

        # Create participant record
        MeetingParticipant.objects.get_or_create(
            meeting=invitation.meeting,
            user=request.user,
            defaults={'role': 'participant'}
        )

        return Response({'message': 'Invitation accepted'})

    @extend_schema(
        description="Decline meeting invitation",
        responses={200: OpenApiResponse(description="Invitation declined")}
    )
    @action(detail=True, methods=['post'])
    def decline(self, request, pk=None):
        invitation = self.get_object()

        if invitation.status != 'pending':
            return Response(
                {'error': f'Invitation is already {invitation.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        invitation.status = 'declined'
        invitation.responded_at = timezone.now()
        invitation.save()

        return Response({'message': 'Invitation declined'})