from rest_framework import viewsets, permissions, filters, status, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from django.db.models import Q, Count, Avg
from django.utils import timezone
from django.conf import settings
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiResponse, OpenApiTypes
import os
import logging

from .models import (
    Notification, SystemSetting, FileUpload, ErrorLog, AuditLog, APILog,
    NotificationRecipient
)
from .serializers import (
    NotificationSerializer, SystemSettingSerializer, FileUploadSerializer,
    AuditLogSerializer, ErrorLogSerializer, APILogSerializer,
    HealthCheckSerializer, AdminDashboardStatsSerializer
)
from apps.users.models import User

logger = logging.getLogger(__name__)

# Try to import magic, with fallback
try:
    import magic
    MAGIC_AVAILABLE = True
except ImportError:
    MAGIC_AVAILABLE = False
    try:
        import filetype
        FILETYPE_AVAILABLE = True
    except ImportError:
        FILETYPE_AVAILABLE = False


# ==============================================================================
# SERIALIZERS FOR APIVIEWS
# ==============================================================================

class FileUploadResponseSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    file_name = serializers.CharField()
    file_size = serializers.IntegerField()
    file_size_display = serializers.CharField()
    file_type = serializers.CharField()
    mime_type = serializers.CharField()
    url = serializers.URLField()
    uploaded_by_name = serializers.CharField()
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()


class HealthCheckResponseSerializer(serializers.Serializer):
    status = serializers.CharField()
    timestamp = serializers.DateTimeField()
    version = serializers.CharField()


class CoreDashboardStatsResponseSerializer(serializers.Serializer):
    users = serializers.DictField()
    simulations = serializers.DictField()
    scenarios = serializers.IntegerField()
    activity = serializers.DictField()


# ==============================================================================
# VIEWSETS
# ==============================================================================

class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    """View user notifications"""
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = NotificationSerializer
    queryset = Notification.objects.all()
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Notification.objects.none()

        user = self.request.user
        now = timezone.now()
        
        return Notification.objects.filter(
            Q(is_global=True) | Q(recipients=user),
            Q(expires_at__isnull=True) | Q(expires_at__gt=now),
            is_active=True
        ).distinct()
    
    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['user'] = self.request.user
        return context
    
    @extend_schema(
        description="Mark a notification as read",
        responses={200: OpenApiResponse(description="Notification marked as read")}
    )
    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        """Mark notification as read"""
        notification = self.get_object()
        recipient = notification.recipient_records.filter(user=request.user).first()
        
        if recipient:
            recipient.is_read = True
            recipient.read_at = timezone.now()
            recipient.save()
        else:
            NotificationRecipient.objects.create(
                notification=notification,
                user=request.user,
                is_read=True,
                read_at=timezone.now()
            )
        
        return Response({'status': 'marked as read'})
    
    @extend_schema(
        description="Mark all notifications as read",
        responses={200: OpenApiResponse(description="All notifications marked as read")}
    )
    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        """Mark all notifications as read"""
        user = request.user
        
        NotificationRecipient.objects.filter(
            user=user,
            is_read=False
        ).update(is_read=True, read_at=timezone.now())
        
        unread_globals = Notification.objects.filter(
            is_global=True,
            is_active=True,
            expires_at__gt=timezone.now()
        ).exclude(
            recipient_records__user=user
        )
        
        for notification in unread_globals:
            NotificationRecipient.objects.create(
                notification=notification,
                user=user,
                is_read=True,
                read_at=timezone.now()
            )
        
        return Response({'status': 'all marked as read'})


class SystemSettingViewSet(viewsets.ReadOnlyModelViewSet):
    """View public system settings"""
    permission_classes = [permissions.AllowAny]
    serializer_class = SystemSettingSerializer
    queryset = SystemSetting.objects.filter(is_public=True, is_active=True)
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    
    @extend_schema(
        description="List all public system settings",
        responses={200: SystemSettingSerializer(many=True)}
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)
    
    @extend_schema(
        description="Retrieve a specific system setting",
        responses={200: SystemSettingSerializer()}
    )
    def retrieve(self, request, *args, **kwargs):
        return super().retrieve(request, *args, **kwargs)


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """View audit logs (admin only)"""
    permission_classes = [permissions.IsAdminUser]
    serializer_class = AuditLogSerializer
    queryset = AuditLog.objects.all().select_related('user').order_by('-timestamp')
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    
    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return AuditLog.objects.none()
        return super().get_queryset()
    
    @extend_schema(
        description="List audit logs",
        parameters=[
            OpenApiParameter('user_id', OpenApiTypes.STR),
            OpenApiParameter('action', OpenApiTypes.STR),
            OpenApiParameter('app_name', OpenApiTypes.STR),
            OpenApiParameter('from_date', OpenApiTypes.STR),
            OpenApiParameter('to_date', OpenApiTypes.STR),
        ],
        responses={200: AuditLogSerializer(many=True)}
    )
    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        
        # Apply filters
        user_id = request.query_params.get('user_id')
        if user_id:
            queryset = queryset.filter(user_id=user_id)
        
        action = request.query_params.get('action')
        if action:
            queryset = queryset.filter(action=action)
        
        app_name = request.query_params.get('app_name')
        if app_name:
            queryset = queryset.filter(app_name=app_name)
        
        from_date = request.query_params.get('from_date')
        if from_date:
            queryset = queryset.filter(timestamp__gte=from_date)
        
        to_date = request.query_params.get('to_date')
        if to_date:
            queryset = queryset.filter(timestamp__lte=to_date)
        
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


class ErrorLogViewSet(viewsets.ReadOnlyModelViewSet):
    """View error logs (admin only)"""
    permission_classes = [permissions.IsAdminUser]
    serializer_class = ErrorLogSerializer
    queryset = ErrorLog.objects.all().select_related('user').order_by('-created_at')
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    
    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return ErrorLog.objects.none()
        return super().get_queryset()
    
    @extend_schema(
        description="List error logs",
        parameters=[
            OpenApiParameter('level', OpenApiTypes.STR),
            OpenApiParameter('from_date', OpenApiTypes.STR),
        ],
        responses={200: ErrorLogSerializer(many=True)}
    )
    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        
        level = request.query_params.get('level')
        if level:
            queryset = queryset.filter(level=level)
        
        from_date = request.query_params.get('from_date')
        if from_date:
            queryset = queryset.filter(created_at__gte=from_date)
        
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


class APILogViewSet(viewsets.ReadOnlyModelViewSet):
    """View API logs (admin only)"""
    permission_classes = [permissions.IsAdminUser]
    serializer_class = APILogSerializer
    queryset = APILog.objects.all().select_related('user').order_by('-timestamp')
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    
    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return APILog.objects.none()
        return super().get_queryset()
    
    @extend_schema(
        description="List API logs",
        parameters=[
            OpenApiParameter('path', OpenApiTypes.STR),
            OpenApiParameter('method', OpenApiTypes.STR),
            OpenApiParameter('status', OpenApiTypes.INT),
        ],
        responses={200: APILogSerializer(many=True)}
    )
    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        
        path = request.query_params.get('path')
        if path:
            queryset = queryset.filter(path__icontains=path)
        
        method = request.query_params.get('method')
        if method:
            queryset = queryset.filter(method=method)
        
        status_code = request.query_params.get('status')
        if status_code:
            queryset = queryset.filter(response_status=status_code)
        
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


# ==============================================================================
# API VIEWS
# ==============================================================================

class FileUploadView(APIView):
    """Handle file uploads"""
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    
    @extend_schema(
        request={
            'multipart/form-data': {
                'type': 'object',
                'properties': {
                    'file': {
                        'type': 'string',
                        'format': 'binary',
                        'description': 'File to upload'
                    }
                },
                'required': ['file']
            }
        },
        responses={201: FileUploadResponseSerializer()}
    )
    def post(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response(
                {'error': 'No file provided'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        max_size = getattr(settings, 'MAX_UPLOAD_SIZE', 10 * 1024 * 1024)
        if file.size > max_size:
            return Response(
                {'error': f'File size exceeds {max_size//(1024*1024)}MB limit'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        mime_type = None
        
        if MAGIC_AVAILABLE:
            mime_type = self.get_mime_type_magic(file)
        
        if not mime_type and FILETYPE_AVAILABLE:
            mime_type = self.get_mime_type_filetype(file)
        
        if not mime_type:
            mime_type = self.get_mime_type_fallback(file.name)
        
        file_type = self.get_file_type_from_extension(file.name, mime_type)
        
        file_upload = FileUpload.objects.create(
            file=file,
            file_name=file.name,
            file_size=file.size,
            file_type=file_type,
            mime_type=mime_type,
            uploaded_by=request.user
        )
        
        serializer = FileUploadSerializer(file_upload, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    
    def get_file_type_from_extension(self, filename, mime_type):
        ext = os.path.splitext(filename)[1].lower().replace('.', '')
        
        if mime_type.startswith('image/') or ext in ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg']:
            return 'image'
        elif mime_type.startswith('video/') or ext in ['mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'webm']:
            return 'video'
        elif mime_type.startswith('audio/') or ext in ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a']:
            return 'audio'
        elif mime_type in ['application/pdf', 'application/msword', 
                          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                          'application/vnd.ms-excel',
                          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                          'application/vnd.ms-powerpoint',
                          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                          'text/plain', 'text/html', 'text/markdown'] or ext in ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md']:
            return 'document'
        else:
            return 'other'
    
    def get_mime_type_magic(self, file_obj):
        try:
            file_obj.seek(0)
            mime_type = magic.from_buffer(file_obj.read(2048), mime=True)
            file_obj.seek(0)
            return mime_type
        except Exception as e:
            logger.warning(f"Magic library failed: {str(e)}")
            return None
    
    def get_mime_type_filetype(self, file_obj):
        try:
            file_obj.seek(0)
            kind = filetype.guess(file_obj.read(2048))
            file_obj.seek(0)
            if kind:
                return kind.mime
            return None
        except Exception as e:
            logger.warning(f"Filetype library failed: {str(e)}")
            return None
    
    def get_mime_type_fallback(self, filename):
        ext = os.path.splitext(filename)[1].lower()
        
        mime_map = {
            '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
            '.gif': 'image/gif', '.bmp': 'image/bmp', '.webp': 'image/webp',
            '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.avi': 'video/x-msvideo',
            '.mov': 'video/quicktime', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
            '.pdf': 'application/pdf', '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.xls': 'application/vnd.ms-excel',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.ppt': 'application/vnd.ms-powerpoint',
            '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            '.txt': 'text/plain', '.html': 'text/html', '.htm': 'text/html',
            '.md': 'text/markdown', '.json': 'application/json', '.xml': 'application/xml',
            '.zip': 'application/zip', '.rar': 'application/x-rar-compressed',
            '.7z': 'application/x-7z-compressed', '.tar': 'application/x-tar',
            '.gz': 'application/gzip'
        }
        
        return mime_map.get(ext, 'application/octet-stream')


class HealthCheckView(APIView):
    """Health check endpoint"""
    permission_classes = [permissions.AllowAny]
    
    @extend_schema(
        responses={200: HealthCheckResponseSerializer()}
    )
    def get(self, request):
        serializer = HealthCheckSerializer(data={
            'status': 'healthy',
            'timestamp': timezone.now(),
            'version': getattr(settings, 'VERSION', '1.0.0')
        })
        serializer.is_valid()
        return Response(serializer.data)


class DashboardStatsView(APIView):
    """Get dashboard statistics for admin"""
    permission_classes = [permissions.IsAdminUser]
    
    @extend_schema(
        responses={200: CoreDashboardStatsResponseSerializer()}
    )
    def get(self, request):
        from django.db.models import Count, Avg
        from apps.simulations.models import SimulationSession, Scenario
        
        total_users = User.objects.count()
        active_users = User.objects.filter(is_active=True).count()
        total_simulations = SimulationSession.objects.count() if 'simulations' in settings.INSTALLED_APPS else 0
        completed_simulations = SimulationSession.objects.filter(status='completed').count() if 'simulations' in settings.INSTALLED_APPS else 0
        total_scenarios = Scenario.objects.count() if 'simulations' in settings.INSTALLED_APPS else 0
        
        recent_errors = ErrorLog.objects.filter(
            created_at__gte=timezone.now() - timezone.timedelta(days=1)
        ).count()
        
        recent_uploads = FileUpload.objects.filter(
            created_at__gte=timezone.now() - timezone.timedelta(days=1)
        ).count()
        
        by_role = dict(
            User.objects.values('role').annotate(c=Count('id')).values_list('role', 'c')
        )
        from apps.simulations.models import CourseCertificate
        certs = CourseCertificate.objects.count()

        data = {
            'users': {
                'total': total_users,
                'active': active_users,
                'completion_rate': round((active_users / total_users * 100) if total_users > 0 else 0, 2),
                'by_role': {
                    'trainee': by_role.get('trainee', 0),
                    'supervisor': by_role.get('supervisor', 0),
                    'instructor': by_role.get('instructor', 0),
                    'admin': by_role.get('admin', 0),
                },
            },
            'simulations': {
                'total': total_simulations,
                'completed': completed_simulations,
                'completion_rate': round((completed_simulations / total_simulations * 100) if total_simulations > 0 else 0, 2)
            },
            'scenarios': total_scenarios,
            'certificates_issued': certs,
            'activity': {
                'errors_24h': recent_errors,
                'uploads_24h': recent_uploads
            }
        }
        
        serializer = AdminDashboardStatsSerializer(data=data)
        serializer.is_valid()
        return Response(serializer.data)