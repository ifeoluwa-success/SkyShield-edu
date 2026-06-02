from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from .models import Notification, SystemSetting, FileUpload, AuditLog, ErrorLog, APILog


class NotificationSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    type = serializers.CharField(source='notification_type')
    is_read = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    updated_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    
    class Meta:
        model = Notification
        fields = [
            'id', 'title', 'message', 'type', 'link',
            'is_global', 'is_read', 'expires_at',
            'created_at', 'updated_at'
        ]
    
    @extend_schema_field(serializers.BooleanField())
    def get_is_read(self, obj):
        user = self.context.get('user')
        if user and user.is_authenticated:
            return obj.recipient_records.filter(user=user, is_read=True).exists()
        return False


class SystemSettingSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    created_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    updated_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    
    class Meta:
        model = SystemSetting
        fields = ['id', 'key', 'value', 'description', 'is_public', 
                 'data_type', 'created_at', 'updated_at']


class FileUploadSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    url = serializers.SerializerMethodField()
    uploaded_by_name = serializers.SerializerMethodField()
    file_size_display = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    updated_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    
    class Meta:
        model = FileUpload
        fields = [
            'id', 'file_name', 'file_size', 'file_size_display', 'file_type',
            'mime_type', 'url', 'uploaded_by_name', 'created_at', 'updated_at'
        ]
    
    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_url(self, obj):
        request = self.context.get('request')
        if obj.file and request:
            return request.build_absolute_uri(obj.file.url)
        return None
    
    @extend_schema_field(serializers.CharField())
    def get_uploaded_by_name(self, obj):
        if obj.uploaded_by:
            return obj.uploaded_by.get_full_name() or obj.uploaded_by.username
        return 'Anonymous'
    
    @extend_schema_field(serializers.CharField())
    def get_file_size_display(self, obj):
        size = obj.file_size
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size < 1024:
                return f"{size:.1f} {unit}"
            size /= 1024
        return f"{size:.1f} TB"


class AuditLogSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    user_email = serializers.SerializerMethodField()
    user_name = serializers.SerializerMethodField()
    timestamp = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    
    class Meta:
        model = AuditLog
        fields = [
            'id', 'user_email', 'user_name', 'action', 'app_name',
            'model_name', 'object_id', 'object_repr', 'changes',
            'ip_address', 'user_agent', 'timestamp'
        ]
    
    @extend_schema_field(serializers.EmailField(allow_null=True))
    def get_user_email(self, obj):
        return obj.user.email if obj.user else None
    
    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_user_name(self, obj):
        return obj.user.get_full_name() if obj.user else 'System'


class ErrorLogSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    user_email = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    
    class Meta:
        model = ErrorLog
        fields = [
            'id', 'level', 'message', 'traceback', 'url', 'method',
            'user_email', 'ip_address', 'user_agent', 'data', 'created_at'
        ]
    
    @extend_schema_field(serializers.EmailField(allow_null=True))
    def get_user_email(self, obj):
        return obj.user.email if obj.user else None


class APILogSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    user_email = serializers.SerializerMethodField()
    timestamp = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ", read_only=True)
    
    class Meta:
        model = APILog
        fields = [
            'id', 'user_email', 'path', 'method', 'query_params',
            'request_body', 'response_status', 'response_body',
            'ip_address', 'user_agent', 'execution_time', 'timestamp'
        ]
    
    @extend_schema_field(serializers.EmailField(allow_null=True))
    def get_user_email(self, obj):
        return obj.user.email if obj.user else None


class HealthCheckSerializer(serializers.Serializer):
    status = serializers.CharField()
    timestamp = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S.%fZ")
    version = serializers.CharField()
    websockets = serializers.BooleanField(required=False)
    server = serializers.CharField(required=False, allow_blank=True)
    websocket_hint = serializers.CharField(required=False, allow_blank=True)


class AdminDashboardStatsSerializer(serializers.Serializer):
    users = serializers.DictField()
    simulations = serializers.DictField()
    scenarios = serializers.IntegerField()
    activity = serializers.DictField()