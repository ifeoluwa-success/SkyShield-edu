from rest_framework import serializers
from django.apps import apps
from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from .models import Meeting, MeetingParticipant, MeetingInvitation, MeetingRecording, MeetingChat

# Lazy loader for UserProfileSerializer to avoid circular imports
def get_user_profile_serializer():
    """Dynamically get UserProfileSerializer to avoid circular imports"""
    User = apps.get_model('users', 'User')
    
    class DynamicUserProfileSerializer(serializers.ModelSerializer):
        full_name = serializers.SerializerMethodField()
        
        class Meta:
            model = User
            fields = ['id', 'email', 'username', 'first_name', 'last_name', 'full_name',
                     'role', 'profile_picture', 'organization']
        
        @extend_schema_field(serializers.CharField())
        def get_full_name(self, obj):
            return obj.get_full_name()
    
    return DynamicUserProfileSerializer

# Lazy loader for TutorProfileSerializer
def get_tutor_profile_serializer():
    """Dynamically get TutorProfileSerializer to avoid circular imports"""
    TutorProfile = apps.get_model('tutor', 'TutorProfile')
    
    class DynamicTutorProfileSerializer(serializers.ModelSerializer):
        tutor_name = serializers.SerializerMethodField()
        
        class Meta:
            model = TutorProfile
            fields = ['id', 'user', 'tutor_name', 'specialization', 'bio', 
                     'experience_years', 'average_rating']
        
        @extend_schema_field(serializers.CharField())
        def get_tutor_name(self, obj):
            return obj.user.get_full_name() or obj.user.username
    
    return DynamicTutorProfileSerializer


class MeetingParticipantSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    user_details = serializers.SerializerMethodField()
    joined_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", allow_null=True)
    left_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", allow_null=True)
    last_heartbeat = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    joined_at_formatted = serializers.SerializerMethodField()
    metadata = serializers.JSONField(default=dict)
    client_info = serializers.JSONField(default=dict)
    
    class Meta:
        model = MeetingParticipant
        fields = [
            'id', 'user', 'user_details', 'role', 'status',
            'video_enabled', 'audio_enabled', 'screen_sharing',
            'is_muted', 'hand_raised', 'joined_at', 'left_at',
            'last_heartbeat', 'joined_at_formatted', 'is_active', 
            'connection_quality', 'metadata', 'client_info'
        ]
        read_only_fields = ['id', 'joined_at', 'left_at', 'last_heartbeat', 'is_active']
    
    @extend_schema_field(serializers.DictField())
    def get_user_details(self, obj):
        UserProfileSerializer = get_user_profile_serializer()
        return UserProfileSerializer(obj.user).data
    
    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_joined_at_formatted(self, obj):
        if obj.joined_at:
            return obj.joined_at.strftime("%Y-%m-%d %H:%M:%S")
        return None


class MeetingListSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    host_name = serializers.SerializerMethodField()
    participant_count = serializers.IntegerField(read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    meeting_type_display = serializers.CharField(source='get_meeting_type_display', read_only=True)
    is_host = serializers.SerializerMethodField()
    can_join = serializers.SerializerMethodField()
    has_password = serializers.SerializerMethodField()
    scheduled_start = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ")
    scheduled_end = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ")
    actual_start = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", allow_null=True)
    actual_end = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", allow_null=True)
    created_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    updated_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    
    class Meta:
        model = Meeting
        fields = [
            'id', 'title', 'description', 'meeting_code', 'room_name',
            'host', 'host_name', 'tutor_profile', 'meeting_type', 'meeting_type_display',
            'status', 'status_display', 'scheduled_start', 'scheduled_end',
            'actual_start', 'actual_end', 'max_participants', 'participant_count',
            'is_private', 'has_password', 'is_host', 'can_join', 'recording_available',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'meeting_code', 'room_name', 'actual_start', 
                           'actual_end', 'participant_count', 'recording_available',
                           'created_at', 'updated_at']
    
    @extend_schema_field(serializers.CharField())
    def get_host_name(self, obj):
        return obj.host.get_full_name() or obj.host.username
    
    @extend_schema_field(serializers.BooleanField())
    def get_is_host(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.host == request.user
        return False

    @extend_schema_field(serializers.BooleanField())
    def get_has_password(self, obj):
        return bool(obj.password)
    
    @extend_schema_field(serializers.BooleanField())
    def get_can_join(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False

        user = request.user

        if obj.host_id == user.id:
            return True

        if obj.status not in ['scheduled', 'live']:
            return False

        if getattr(obj, '_user_is_participant', False):
            return True

        if obj.participant_count >= obj.max_participants:
            return False

        return True


class MeetingDetailSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    host_details = serializers.SerializerMethodField()
    tutor_details = serializers.SerializerMethodField()
    participants = MeetingParticipantSerializer(many=True, read_only=True)
    participant_count = serializers.IntegerField(read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    meeting_type_display = serializers.CharField(source='get_meeting_type_display', read_only=True)
    is_host = serializers.SerializerMethodField()
    join_url = serializers.SerializerMethodField()
    has_password = serializers.SerializerMethodField()
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    settings = serializers.JSONField(default=dict)
    metadata = serializers.JSONField(default=dict)
    scheduled_start = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ")
    scheduled_end = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ")
    actual_start = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", allow_null=True)
    actual_end = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", allow_null=True)
    created_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    updated_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    
    class Meta:
        model = Meeting
        fields = [
            'id', 'title', 'description', 'meeting_code', 'room_name',
            'host', 'host_details', 'tutor_profile', 'tutor_details', 'meeting_type', 'meeting_type_display',
            'status', 'status_display', 'scheduled_start', 'scheduled_end',
            'actual_start', 'actual_end', 'max_participants', 'participant_count',
            'peak_participants', 'duration_seconds', 'is_private',
            'require_host_to_start', 'allow_recording', 'allow_chat',
            'allow_screen_share', 'password', 'has_password', 'waiting_room_enabled',
            'lock_on_start', 'recording_url', 'recording_available',
            'settings', 'metadata', 'participants', 'is_host', 'join_url',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'meeting_code', 'room_name', 'actual_start', 'actual_end',
            'peak_participants', 'duration_seconds', 'participant_count',
            'recording_url', 'recording_available', 'created_at', 'updated_at',
            'has_password',
        ]
    
    @extend_schema_field(serializers.DictField())
    def get_host_details(self, obj):
        UserProfileSerializer = get_user_profile_serializer()
        return UserProfileSerializer(obj.host).data
    
    @extend_schema_field(serializers.DictField(allow_null=True))
    def get_tutor_details(self, obj):
        if obj.tutor_profile:
            TutorProfileSerializer = get_tutor_profile_serializer()
            return TutorProfileSerializer(obj.tutor_profile).data
        return None
    
    @extend_schema_field(serializers.BooleanField())
    def get_is_host(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.host == request.user
        return False

    @extend_schema_field(serializers.BooleanField())
    def get_has_password(self, obj):
        return bool(obj.password)
    
    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_join_url(self, obj):
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(f"/meetings/join/{obj.meeting_code}/")
        return None


class MeetingCreateSerializer(serializers.ModelSerializer):
    scheduled_start = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ")
    scheduled_end = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ")
    settings = serializers.JSONField(required=False, default=dict)
    metadata = serializers.JSONField(required=False, default=dict)
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    
    class Meta:
        model = Meeting
        fields = [
            'title', 'description', 'meeting_type', 'scheduled_start',
            'scheduled_end', 'max_participants', 'is_private', 'password',
            'require_host_to_start', 'allow_recording', 'allow_chat',
            'allow_screen_share', 'waiting_room_enabled', 'lock_on_start',
            'tutor_profile', 'settings', 'metadata'
        ]
    
    def validate(self, data):
        """Validate meeting times"""
        if data['scheduled_start'] >= data['scheduled_end']:
            raise serializers.ValidationError(
                "End time must be after start time"
            )
        
        if data['scheduled_start'] < timezone.now():
            if not self.context.get('allow_past'):
                raise serializers.ValidationError(
                    "Cannot schedule meetings in the past"
                )
        
        return data
    
    def create(self, validated_data):
        request = self.context.get('request')
        validated_data['host'] = request.user
        
        # tutor_profile can be set here if provided in the request
        # It's optional, so it's fine if it's not provided
        
        return super().create(validated_data)


class MeetingInvitationSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    meeting_details = MeetingListSerializer(source='meeting', read_only=True)
    invited_user_details = serializers.SerializerMethodField()
    invited_by_details = serializers.SerializerMethodField()
    expires_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ")
    responded_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", allow_null=True)
    created_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    
    class Meta:
        model = MeetingInvitation
        fields = [
            'id', 'meeting', 'meeting_details', 'invited_user', 'invited_user_details',
            'invited_by', 'invited_by_details', 'status', 'token',
            'email_sent', 'notification_sent', 'responded_at', 'expires_at',
            'created_at'
        ]
        read_only_fields = ['id', 'token', 'created_at']
    
    @extend_schema_field(serializers.DictField())
    def get_invited_user_details(self, obj):
        UserProfileSerializer = get_user_profile_serializer()
        return UserProfileSerializer(obj.invited_user).data
    
    @extend_schema_field(serializers.DictField())
    def get_invited_by_details(self, obj):
        UserProfileSerializer = get_user_profile_serializer()
        return UserProfileSerializer(obj.invited_by).data


class MeetingRecordingSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    meeting_title = serializers.CharField(source='meeting.title', read_only=True)
    requested_by_name = serializers.SerializerMethodField()
    started_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", allow_null=True)
    completed_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", allow_null=True)
    created_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    
    class Meta:
        model = MeetingRecording
        fields = [
            'id', 'meeting', 'meeting_title', 'requested_by', 'requested_by_name',
            'status', 'file_path', 'file_size', 'duration_seconds',
            'task_id', 'error_message', 'started_at', 'completed_at', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']
    
    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_requested_by_name(self, obj):
        if obj.requested_by:
            return obj.requested_by.get_full_name() or obj.requested_by.username
        return None


class MeetingChatSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    sender_name = serializers.SerializerMethodField()
    sender_avatar = serializers.SerializerMethodField()
    is_private = serializers.BooleanField(read_only=True)
    created_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    
    class Meta:
        model = MeetingChat
        fields = [
            'id', 'meeting', 'sender', 'sender_name', 'sender_avatar',
            'recipient', 'message_type', 'content', 'is_edited',
            'is_deleted', 'created_at', 'is_private'
        ]
        read_only_fields = ['id', 'created_at', 'is_edited', 'is_deleted']
    
    @extend_schema_field(serializers.CharField())
    def get_sender_name(self, obj):
        return obj.sender.get_full_name() or obj.sender.username
    
    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_sender_avatar(self, obj):
        if obj.sender.profile_picture:
            return obj.sender.profile_picture.url
        return None
    
    @extend_schema_field(serializers.BooleanField())
    def get_is_private(self, obj):
        return obj.recipient is not None


class MeetingActionSerializer(serializers.Serializer):
    """Serializer for meeting actions (start, end, etc.)"""
    action = serializers.ChoiceField(choices=['start', 'end', 'lock', 'unlock'])
    reason = serializers.CharField(required=False, allow_blank=True)


class MeetingJoinSerializer(serializers.Serializer):
    """Serializer for joining a meeting"""
    meeting_code = serializers.CharField(required=False)
    password = serializers.CharField(required=False, allow_blank=True)
    video_enabled = serializers.BooleanField(default=False)
    audio_enabled = serializers.BooleanField(default=False)
    client_info = serializers.JSONField(required=False, default=dict)


class MeetingJoinResponseSerializer(serializers.Serializer):
    """Serializer for meeting join response"""
    message = serializers.CharField()
    meeting = serializers.DictField()
    participant = serializers.DictField()
    signaling = serializers.DictField()


class ICEPartnerSerializer(serializers.Serializer):
    """Serializer for ICE server configuration"""
    urls = serializers.URLField()
    username = serializers.CharField(required=False)
    credential = serializers.CharField(required=False)