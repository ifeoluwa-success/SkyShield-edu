from rest_framework import viewsets, permissions, filters, status, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from django.db.models import Q, Count, Avg
from django.utils import timezone
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiResponse, OpenApiTypes
import logging

from .models import (
    ContentCategory, LearningMaterial, LearningPath,
    GlossaryTerm, FAQ, Announcement, MaterialBookmark,
    MaterialComment, MaterialRating, MaterialLike, MaterialView,
    MaterialDownload, MaterialProgress, PathEnrollment, AnnouncementRead,
)
from .permissions import IsContentStaff
from .serializers import (
    ContentCategorySerializer, LearningMaterialListSerializer,
    LearningMaterialDetailSerializer, LearningPathListSerializer,
    LearningPathDetailSerializer, GlossaryTermSerializer,
    FAQSerializer, AnnouncementSerializer, MaterialBookmarkSerializer,
    MaterialCommentSerializer, MaterialRatingSerializer, MaterialProgressSerializer,
    SearchResultSerializer,
)

logger = logging.getLogger(__name__)


# ==============================================================================
# SERIALIZERS FOR APIVIEWS
# ==============================================================================

class SearchResponseSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    title = serializers.CharField()
    type = serializers.CharField()
    description = serializers.CharField()
    url = serializers.CharField()
    score = serializers.FloatField()
    created_at = serializers.DateTimeField(allow_null=True, required=False)
    author_name = serializers.CharField(allow_null=True, required=False)


# ==============================================================================
# VIEWSETS
# ==============================================================================

class ContentCategoryViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing content categories.
    Provides endpoints to list categories and get materials under a category.
    """
    permission_classes = [permissions.AllowAny]
    serializer_class = ContentCategorySerializer
    lookup_field = 'slug'
    
    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return ContentCategory.objects.none()
        return ContentCategory.objects.filter(
            is_active=True, 
            parent__isnull=True
        ).prefetch_related('children')
    
    @extend_schema(
        description="Get materials under this category and its subcategories",
        parameters=[
            OpenApiParameter(
                'type', 
                OpenApiTypes.STR, 
                description="Filter by material type",
                enum=['article', 'video', 'tutorial', 'exercise', 'quiz', 'document']
            ),
            OpenApiParameter(
                'difficulty', 
                OpenApiTypes.STR, 
                description="Filter by difficulty level",
                enum=['beginner', 'intermediate', 'advanced', 'expert']
            ),
            OpenApiParameter(
                'search', 
                OpenApiTypes.STR, 
                description="Search in title, description, and tags"
            ),
        ]
    )
    @action(detail=True, methods=['get'], url_path='materials')
    def materials(self, request, slug=None):
        """
        Get all materials in this category including subcategories.
        """
        category = self.get_object()
        
        # Get all category IDs including children and grandchildren
        category_ids = [category.id]
        for child in category.children.filter(is_active=True):
            category_ids.append(child.id)
            for grandchild in child.children.filter(is_active=True):
                category_ids.append(grandchild.id)
        
        # Base queryset
        materials = LearningMaterial.objects.filter(
            category_id__in=category_ids,
            is_published=True
        ).select_related('author', 'category').order_by('-created_at')
        
        # Apply filters
        material_type = request.query_params.get('type')
        if material_type:
            materials = materials.filter(material_type=material_type)
        
        difficulty = request.query_params.get('difficulty')
        if difficulty:
            materials = materials.filter(difficulty=difficulty)
        
        search = request.query_params.get('search')
        if search:
            materials = materials.filter(
                Q(title__icontains=search) |
                Q(description__icontains=search) |
                Q(tags__icontains=search)
            )
        
        # Annotate with counts
        materials = materials.annotate(
            bookmark_count=Count('bookmarks', distinct=True),
            comment_count=Count('comments', distinct=True)
        )
        
        context = self.get_serializer_context()
        context['user'] = request.user
        
        # Paginate response
        page = self.paginate_queryset(materials)
        if page is not None:
            serializer = LearningMaterialListSerializer(page, many=True, context=context)
            return self.get_paginated_response(serializer.data)
        
        serializer = LearningMaterialListSerializer(materials, many=True, context=context)
        return Response(serializer.data)


class LearningMaterialViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing learning materials.
    Provides filtering, searching, and interaction endpoints.
    """
    permission_classes = [permissions.AllowAny]
    lookup_field = 'slug'
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    
    def get_serializer_class(self):
        if self.action == 'retrieve':
            return LearningMaterialDetailSerializer
        return LearningMaterialListSerializer
    
    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return LearningMaterial.objects.none()
        return LearningMaterial.objects.filter(is_published=True).select_related('author', 'category')
    
    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['user'] = self.request.user
        if self.action == 'list':
            queryset = self.filter_queryset(self.get_queryset())
            material_ids = list(queryset.values_list('id', flat=True))
            from apps.simulations.query_helpers import learning_material_user_context

            context['material_user_flags'] = learning_material_user_context(
                self.request.user, material_ids
            )
        return context
    
    @extend_schema(
        description="List learning materials with optional filters",
        parameters=[
            OpenApiParameter(
                'category', 
                OpenApiTypes.STR, 
                description="Filter by category slug"
            ),
            OpenApiParameter(
                'type', 
                OpenApiTypes.STR, 
                description="Filter by material type",
                enum=['article', 'video', 'tutorial', 'exercise', 'quiz', 'document']
            ),
            OpenApiParameter(
                'difficulty', 
                OpenApiTypes.STR, 
                description="Filter by difficulty level",
                enum=['beginner', 'intermediate', 'advanced', 'expert']
            ),
            OpenApiParameter(
                'search', 
                OpenApiTypes.STR, 
                description="Search in title, description, content, and tags"
            ),
            OpenApiParameter(
                'featured', 
                OpenApiTypes.BOOL, 
                description="Filter featured materials only"
            ),
            OpenApiParameter(
                'sort', 
                OpenApiTypes.STR, 
                description="Sort field (created_at, -created_at, title, -title, views_count, -views_count, average_rating, -average_rating)"
            ),
        ]
    )
    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        
        # Apply filters
        category = request.query_params.get('category')
        if category:
            queryset = queryset.filter(category__slug=category)
        
        material_type = request.query_params.get('type')
        if material_type:
            queryset = queryset.filter(material_type=material_type)
        
        difficulty = request.query_params.get('difficulty')
        if difficulty:
            queryset = queryset.filter(difficulty=difficulty)
        
        search = request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search) |
                Q(description__icontains=search) |
                Q(content__icontains=search) |
                Q(tags__icontains=search)
            )
        
        featured = request.query_params.get('featured')
        if featured and featured.lower() == 'true':
            queryset = queryset.filter(is_featured=True)
        
        # Apply sorting
        sort = request.query_params.get('sort', '-created_at')
        valid_sort_fields = ['created_at', '-created_at', 'title', '-title', 
                           'views_count', '-views_count', 'average_rating', '-average_rating']
        if sort in valid_sort_fields:
            queryset = queryset.order_by(sort)
        
        # Annotate with counts
        queryset = queryset.annotate(
            bookmark_count=Count('bookmarks', distinct=True),
            comment_count=Count('comments', distinct=True)
        )
        
        # Paginate response
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)
    
    @extend_schema(description="Retrieve a learning material by slug")
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        
        # Increment view count
        instance.views_count += 1
        instance.save(update_fields=['views_count'])
        
        # Track view for authenticated users
        if request.user.is_authenticated:
            MaterialView.objects.create(
                user=request.user,
                material=instance,
                ip_address=self.get_client_ip(request),
                user_agent=request.META.get('HTTP_USER_AGENT', '')[:255]
            )
        
        serializer = self.get_serializer(instance)
        return Response(serializer.data)
    
    def get_client_ip(self, request):
        """Get client IP address from request."""
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0]
        else:
            ip = request.META.get('REMOTE_ADDR')
        return ip
    
    @extend_schema(
        description="Bookmark or unbookmark a material",
        responses={200: OpenApiResponse(description="Bookmark status")}
    )
    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def bookmark(self, request, slug=None):
        """Toggle bookmark for a material."""
        material = self.get_object()
        bookmark, created = MaterialBookmark.objects.get_or_create(
            user=request.user,
            material=material
        )
        
        if not created:
            bookmark.delete()
            return Response({'bookmarked': False})
        
        return Response({'bookmarked': True})
    
    @extend_schema(
        description="Like or unlike a material",
        responses={200: OpenApiResponse(description="Like status")}
    )
    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def like(self, request, slug=None):
        """Toggle like for a material."""
        material = self.get_object()
        like, created = MaterialLike.objects.get_or_create(
            user=request.user,
            material=material
        )
        
        if not created:
            like.delete()
            material.likes_count = max(0, material.likes_count - 1)
            material.save(update_fields=['likes_count'])
            return Response({'liked': False, 'likes_count': material.likes_count})
        
        material.likes_count += 1
        material.save(update_fields=['likes_count'])
        return Response({'liked': True, 'likes_count': material.likes_count})
    
    @extend_schema(
        description="Rate a material",
        responses={200: MaterialRatingSerializer}
    )
    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def rate(self, request, slug=None):
        """Rate a material with optional review."""
        material = self.get_object()
        rating_value = request.data.get('rating')
        review = request.data.get('review', '')
        
        # Validate rating
        try:
            rating_value = int(rating_value)
            if rating_value < 1 or rating_value > 5:
                return Response(
                    {'error': 'Rating must be between 1 and 5'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except (TypeError, ValueError):
            return Response(
                {'error': 'Invalid rating value'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Create or update rating
        rating, created = MaterialRating.objects.update_or_create(
            user=request.user,
            material=material,
            defaults={
                'rating': rating_value,
                'review': review
            }
        )
        
        # Update material average rating
        avg = material.ratings.aggregate(Avg('rating'))['rating__avg']
        material.average_rating = round(avg or 0, 2)
        material.ratings_count = material.ratings.count()
        material.save(update_fields=['average_rating', 'ratings_count'])
        
        serializer = MaterialRatingSerializer(rating, context=self.get_serializer_context())
        return Response(serializer.data)
    
    @extend_schema(
        description="Get comments for a material",
        parameters=[
            OpenApiParameter(
                'page', 
                OpenApiTypes.INT, 
                description='Page number'
            ),
        ]
    )
    @action(detail=True, methods=['get'], url_path='comments')
    def get_comments(self, request, slug=None):
        """Get all top-level comments for a material."""
        material = self.get_object()
        comments = material.comments.filter(parent__isnull=True, is_deleted=False).order_by('-created_at')
        
        page = self.paginate_queryset(comments)
        if page is not None:
            serializer = MaterialCommentSerializer(page, many=True, context=self.get_serializer_context())
            return self.get_paginated_response(serializer.data)
        
        serializer = MaterialCommentSerializer(comments, many=True, context=self.get_serializer_context())
        return Response(serializer.data)

    @extend_schema(
        description='Update viewing/reading progress for a material',
        request=MaterialProgressSerializer,
        responses={200: MaterialProgressSerializer},
    )
    @action(detail=True, methods=['post', 'patch'], permission_classes=[permissions.IsAuthenticated])
    def progress(self, request, slug=None):
        """Create or update per-user material progress."""
        material = self.get_object()
        progress_percentage = request.data.get('progress_percentage')
        completed = request.data.get('completed')

        if progress_percentage is not None:
            try:
                progress_percentage = float(progress_percentage)
                progress_percentage = max(0.0, min(100.0, progress_percentage))
            except (TypeError, ValueError):
                return Response(
                    {'error': 'progress_percentage must be a number between 0 and 100'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        defaults = {}
        if progress_percentage is not None:
            defaults['progress_percentage'] = progress_percentage
        if completed is not None:
            defaults['completed'] = bool(completed)
            if defaults['completed']:
                defaults['progress_percentage'] = 100.0
                defaults['completed_at'] = timezone.now()

        record, _ = MaterialProgress.objects.update_or_create(
            user=request.user,
            material=material,
            defaults=defaults or {'progress_percentage': 0.0},
        )

        if record.completed:
            for enrollment in PathEnrollment.objects.filter(
                user=request.user,
                path__in=material.learning_paths.all(),
            ).distinct():
                completed_ids = list(enrollment.completed_materials or [])
                material_id = str(material.id)
                if material_id not in completed_ids:
                    completed_ids.append(material_id)
                    enrollment.completed_materials = completed_ids
                    if enrollment.status == 'enrolled':
                        enrollment.status = 'in_progress'
                    total = enrollment.path.materials.count()
                    if total and len(completed_ids) >= total:
                        enrollment.status = 'completed'
                        enrollment.completed_at = timezone.now()
                    enrollment.save(
                        update_fields=['completed_materials', 'status', 'completed_at', 'last_accessed']
                    )

        serializer = MaterialProgressSerializer(record, context=self.get_serializer_context())
        return Response(serializer.data)


class LearningPathViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing learning paths.
    """
    permission_classes = [permissions.AllowAny]
    lookup_field = 'slug'
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    
    def get_serializer_class(self):
        if self.action == 'retrieve':
            return LearningPathDetailSerializer
        return LearningPathListSerializer
    
    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return LearningPath.objects.none()
        return LearningPath.objects.filter(is_published=True).select_related('author', 'category')
    
    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['user'] = self.request.user
        if self.action == 'list':
            queryset = self.filter_queryset(self.get_queryset())
            path_ids = list(queryset.values_list('id', flat=True))
            from apps.simulations.query_helpers import learning_path_user_context

            context['path_user_context'] = learning_path_user_context(
                self.request.user, path_ids
            )
        return context
    
    @extend_schema(
        description="List learning paths with optional filters",
        parameters=[
            OpenApiParameter(
                'category', 
                OpenApiTypes.STR, 
                description="Filter by category slug"
            ),
            OpenApiParameter(
                'difficulty', 
                OpenApiTypes.STR, 
                description="Filter by difficulty level",
                enum=['beginner', 'intermediate', 'advanced', 'expert']
            ),
            OpenApiParameter(
                'search', 
                OpenApiTypes.STR, 
                description="Search in title, description, and tags"
            ),
            OpenApiParameter(
                'featured', 
                OpenApiTypes.BOOL, 
                description="Filter featured paths only"
            ),
        ]
    )
    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        
        # Apply filters
        category = request.query_params.get('category')
        if category:
            queryset = queryset.filter(category__slug=category)
        
        difficulty = request.query_params.get('difficulty')
        if difficulty:
            queryset = queryset.filter(difficulty=difficulty)
        
        search = request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search) |
                Q(description__icontains=search) |
                Q(tags__icontains=search)
            )
        
        featured = request.query_params.get('featured')
        if featured and featured.lower() == 'true':
            queryset = queryset.filter(is_featured=True)
        
        # Annotate with counts (cannot name annotation `enrolled_count` — it
        # conflicts with the real `LearningPath.enrolled_count` model field).
        queryset = queryset.annotate(
            material_count=Count('materials', distinct=True),
            enrollment_aggregate=Count('enrollments', distinct=True),
        )
        
        # Paginate response
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)
    
    @extend_schema(
        description="Enroll in a learning path",
        responses={200: OpenApiResponse(description="Enrollment status")}
    )
    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def enroll(self, request, slug=None):
        """Enroll in a learning path."""
        path = self.get_object()
        
        enrollment, created = PathEnrollment.objects.get_or_create(
            user=request.user,
            path=path,
            defaults={'status': 'enrolled'}
        )
        
        if not created:
            return Response(
                {'error': 'Already enrolled in this path'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Update enrolled count
        path.enrolled_count = path.enrollments.count()
        path.save(update_fields=['enrolled_count'])
        
        return Response({'enrolled': True})

    @extend_schema(
        description='Mark a material in this path as completed for the current user',
        responses={200: OpenApiResponse(description='Updated enrollment progress')},
    )
    @action(detail=True, methods=['post'], url_path='complete-material', permission_classes=[permissions.IsAuthenticated])
    def complete_material(self, request, slug=None):
        """Record completion of one material on an enrolled path."""
        path = self.get_object()
        material_id = request.data.get('material_id')
        if not material_id:
            return Response({'error': 'material_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        if not path.materials.filter(id=material_id, is_published=True).exists():
            return Response(
                {'error': 'Material is not part of this path'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        enrollment, created = PathEnrollment.objects.get_or_create(
            user=request.user,
            path=path,
            defaults={'status': 'in_progress'},
        )
        if created:
            path.enrolled_count = path.enrollments.count()
            path.save(update_fields=['enrolled_count'])

        completed_ids = list(enrollment.completed_materials or [])
        material_id_str = str(material_id)
        if material_id_str not in completed_ids:
            completed_ids.append(material_id_str)
        enrollment.completed_materials = completed_ids
        if enrollment.status == 'enrolled':
            enrollment.status = 'in_progress'

        total = path.materials.filter(is_published=True).count()
        if total and len(completed_ids) >= total:
            enrollment.status = 'completed'
            enrollment.completed_at = timezone.now()

        enrollment.save(update_fields=['completed_materials', 'status', 'completed_at', 'last_accessed'])

        MaterialProgress.objects.update_or_create(
            user=request.user,
            material_id=material_id,
            defaults={
                'progress_percentage': 100.0,
                'completed': True,
                'completed_at': timezone.now(),
            },
        )

        return Response({
            'status': enrollment.status,
            'progress': enrollment.calculate_progress(),
            'completed_materials': enrollment.completed_materials,
        })


class GlossaryViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing glossary terms.
    """
    permission_classes = [permissions.AllowAny]
    serializer_class = GlossaryTermSerializer
    lookup_field = 'term'
    
    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return GlossaryTerm.objects.none()
        return GlossaryTerm.objects.all().order_by('term')
    
    @extend_schema(
        description="Search glossary terms",
        parameters=[
            OpenApiParameter(
                'q', 
                OpenApiTypes.STR, 
                description="Search query (minimum 2 characters)", 
                required=True
            ),
        ]
    )
    @action(detail=False, methods=['get'], url_path='search')
    def search_terms(self, request):
        """Search for glossary terms."""
        query = request.query_params.get('q', '')
        if len(query) < 2:
            return Response([])
        
        terms = self.get_queryset().filter(
            Q(term__icontains=query) |
            Q(definition__icontains=query)
        )[:20]
        
        serializer = self.get_serializer(terms, many=True)
        return Response(serializer.data)


class FAQViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing FAQs.
    """
    permission_classes = [permissions.AllowAny]
    serializer_class = FAQSerializer
    
    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return FAQ.objects.none()
        return FAQ.objects.filter(is_published=True).order_by('order', '-created_at')
    
    @extend_schema(
        description="Track FAQ view",
        responses={200: OpenApiResponse(description="View count")}
    )
    @action(detail=True, methods=['post'], url_path='track-view')
    def track_view(self, request, pk=None):
        """Track when a FAQ is viewed."""
        faq = self.get_object()
        faq.views_count += 1
        faq.save(update_fields=['views_count'])
        return Response({'views_count': faq.views_count})


class AnnouncementViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing announcements.
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = AnnouncementSerializer
    
    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Announcement.objects.none()

        now = timezone.now()
        user = self.request.user
        role = getattr(user, 'role', None)
        qs = Announcement.objects.filter(
            is_active=True,
            publish_from__lte=now,
        ).filter(
            Q(publish_until__isnull=True) | Q(publish_until__gte=now)
        )
        if role:
            qs = qs.filter(
                Q(target_roles=[]) | Q(target_roles__contains=[role])
            )
        return qs.order_by('-priority', '-publish_from')
    
    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['user'] = self.request.user
        return context
    
    def retrieve(self, request, *args, **kwargs):
        """Mark announcement as read when viewed."""
        instance = self.get_object()
        
        AnnouncementRead.objects.get_or_create(
            user=request.user,
            announcement=instance
        )
        
        serializer = self.get_serializer(instance)
        return Response(serializer.data)
    
    @extend_schema(
        description="Get count of unread announcements",
        responses={200: OpenApiResponse(description="Unread count")}
    )
    @action(detail=False, methods=['get'], url_path='unread')
    def unread_count(self, request):
        """Get count of unread announcements for the current user."""
        queryset = self.get_queryset()
        read_ids = AnnouncementRead.objects.filter(
            user=request.user
        ).values_list('announcement_id', flat=True)
        
        unread_count = queryset.exclude(id__in=read_ids).count()
        return Response({'unread_count': unread_count})


class AnnouncementManageViewSet(viewsets.ModelViewSet):
    """
    Staff CRUD for platform announcements (admin, supervisor, instructor).
    """
    permission_classes = [permissions.IsAuthenticated, IsContentStaff]
    serializer_class = AnnouncementSerializer
    queryset = Announcement.objects.all().order_by('-created_at')
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['user'] = self.request.user
        return context

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class MaterialBookmarkViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing user's bookmarks.
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = MaterialBookmarkSerializer
    
    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return MaterialBookmark.objects.none()

        if not self.request.user.is_authenticated:
            return MaterialBookmark.objects.none()

        return MaterialBookmark.objects.filter(
            user=self.request.user
        ).select_related('material').order_by('-created_at')
    
    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['user'] = self.request.user
        return context
    
    @extend_schema(
        description="Clear all bookmarks",
        responses={204: 'No content'}
    )
    @action(detail=False, methods=['delete'], url_path='clear')
    def clear_all(self, request):
        """Delete all bookmarks for the current user."""
        self.get_queryset().delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MaterialCommentViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing comments on materials.
    Supports nested routes under materials.
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = MaterialCommentSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    
    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return MaterialComment.objects.none()

        material_slug = self.kwargs.get('material_slug')
        queryset = MaterialComment.objects.filter(
            is_deleted=False
        ).select_related('user', 'parent', 'material')

        if material_slug:
            queryset = queryset.filter(material__slug=material_slug, material__is_published=True)

        return queryset.order_by('-created_at')
    
    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['user'] = self.request.user
        return context
    
    def perform_create(self, serializer):
        """Create a new comment for a material."""
        material_slug = self.kwargs.get('material_slug')
        material = LearningMaterial.objects.get(slug=material_slug, is_published=True)
        serializer.save(user=self.request.user, material=material)
    
    def perform_destroy(self, instance):
        """Soft delete a comment."""
        instance.is_deleted = True
        instance.save()
    
    @extend_schema(
        description="Update a comment",
        request=MaterialCommentSerializer
    )
    def update(self, request, *args, **kwargs):
        """Update a comment (owner only)."""
        return super().update(request, *args, **kwargs)
    
    @extend_schema(
        description="Partially update a comment",
        request=MaterialCommentSerializer
    )
    def partial_update(self, request, *args, **kwargs):
        """Partially update a comment (owner only)."""
        return super().partial_update(request, *args, **kwargs)


class SearchView(APIView):
    """
    Search across all content types.
    This view handles GET requests with query parameters.
    """
    permission_classes = [permissions.AllowAny]
    
    @extend_schema(
        parameters=[
            OpenApiParameter(name='q', type=str, location=OpenApiParameter.QUERY, required=True, description='Search query (minimum 2 characters)'),
            OpenApiParameter(name='type', type=str, location=OpenApiParameter.QUERY, required=False, description='Type of content to search (default: all)', enum=['all', 'materials', 'paths', 'glossary', 'faqs']),
        ],
        responses={200: SearchResponseSerializer(many=True)}
    )
    def get(self, request):
        """
        Perform search across different content types.
        """
        query = request.query_params.get('q', '').strip()
        search_type = request.query_params.get('type', 'all')
        
        # Validate minimum query length
        if len(query) < 2:
            return Response([])
        
        results = []
        
        # Search in learning materials
        if search_type in ['all', 'materials']:
            materials = LearningMaterial.objects.filter(
                Q(title__icontains=query) |
                Q(description__icontains=query) |
                Q(content__icontains=query) |
                Q(tags__icontains=query),
                is_published=True
            ).select_related('author', 'category')[:10]
            
            for material in materials:
                results.append({
                    'id': material.id,
                    'title': material.title,
                    'type': 'material',
                    'description': material.description[:200] if material.description else '',
                    'url': f'/content/materials/{material.slug}/',
                    'score': 1.0,
                    'created_at': material.created_at.isoformat() if material.created_at else None,
                    'author_name': material.author.get_full_name() if material.author else 'Unknown'
                })
        
        # Search in learning paths
        if search_type in ['all', 'paths']:
            paths = LearningPath.objects.filter(
                Q(title__icontains=query) |
                Q(description__icontains=query) |
                Q(tags__icontains=query),
                is_published=True
            ).select_related('author', 'category')[:5]
            
            for path in paths:
                results.append({
                    'id': path.id,
                    'title': path.title,
                    'type': 'path',
                    'description': path.description[:200] if path.description else '',
                    'url': f'/content/paths/{path.slug}/',
                    'score': 0.9,
                    'created_at': path.created_at.isoformat() if path.created_at else None,
                    'author_name': path.author.get_full_name() if path.author else 'Unknown'
                })
        
        # Search in glossary
        if search_type in ['all', 'glossary']:
            terms = GlossaryTerm.objects.filter(
                Q(term__icontains=query) |
                Q(definition__icontains=query)
            )[:10]
            
            for term in terms:
                results.append({
                    'id': term.id,
                    'title': term.term,
                    'type': 'glossary',
                    'description': term.definition[:200] if term.definition else '',
                    'url': f'/content/glossary/{term.term}/',
                    'score': 0.8,
                    'created_at': term.created_at.isoformat() if term.created_at else None,
                    'author_name': None
                })
        
        # Search in FAQs
        if search_type in ['all', 'faqs']:
            faqs = FAQ.objects.filter(
                Q(question__icontains=query) |
                Q(answer__icontains=query),
                is_published=True
            )[:5]
            
            for faq in faqs:
                results.append({
                    'id': faq.id,
                    'title': faq.question[:100] + ('...' if len(faq.question) > 100 else ''),
                    'type': 'faq',
                    'description': faq.answer[:200] if faq.answer else '',
                    'url': f'/content/faqs/{faq.id}/',
                    'score': 0.7,
                    'created_at': faq.created_at.isoformat() if faq.created_at else None,
                    'author_name': None
                })
        
        # Sort results by score
        results.sort(key=lambda x: x['score'], reverse=True)
        
        serializer = SearchResultSerializer(results, many=True)
        return Response(serializer.data)