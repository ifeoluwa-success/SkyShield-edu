from rest_framework import serializers
from django.apps import apps
from drf_spectacular.utils import extend_schema_field
from .models import (
    ContentCategory, LearningMaterial, MaterialProgress, MaterialBookmark,
    MaterialComment, MaterialRating, LearningPath, PathEnrollment,
    GlossaryTerm, FAQ, Announcement, AnnouncementRead, MaterialLike,
    MaterialView, MaterialDownload
)


# ==============================================================================
# LAZY USER LOADER  (avoids circular imports)
# ==============================================================================

def get_user_profile_serializer():
    User = apps.get_model('users', 'User')

    class DynamicUserProfileSerializer(serializers.ModelSerializer):
        full_name = serializers.SerializerMethodField()

        class Meta:
            model = User
            fields = [
                'id', 'email', 'username', 'first_name', 'last_name', 'full_name',
                'role', 'profile_picture', 'organization', 'department', 'job_title'
            ]

        @extend_schema_field(serializers.CharField())
        def get_full_name(self, obj):
            return obj.get_full_name()

    return DynamicUserProfileSerializer


# ==============================================================================
# CONTENT CATEGORY
# ==============================================================================

class ContentCategorySerializer(serializers.ModelSerializer):
    children = serializers.SerializerMethodField()
    material_count = serializers.SerializerMethodField()

    class Meta:
        model = ContentCategory
        fields = [
            'id', 'name', 'slug', 'description', 'icon', 'parent',
            'children', 'order', 'material_count', 'is_active',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_children(self, obj):
        children = obj.children.filter(is_active=True)
        return ContentCategorySerializer(children, many=True).data if children.exists() else []

    @extend_schema_field(serializers.IntegerField())
    def get_material_count(self, obj):
        return obj.get_material_count()


# ==============================================================================
# LEARNING MATERIAL
# ==============================================================================

class MaterialAuthorSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = apps.get_model('users', 'User')
        fields = ['id', 'email', 'username', 'full_name', 'profile_picture']

    @extend_schema_field(serializers.CharField())
    def get_full_name(self, obj):
        return obj.get_full_name()


class LearningMaterialListSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    author_name = serializers.SerializerMethodField()
    author_details = serializers.SerializerMethodField()
    is_bookmarked = serializers.SerializerMethodField()
    is_liked = serializers.SerializerMethodField()
    user_rating = serializers.SerializerMethodField()
    user_progress = serializers.SerializerMethodField()

    class Meta:
        model = LearningMaterial
        fields = [
            'id', 'title', 'slug', 'description', 'material_type',
            'category', 'category_name', 'difficulty', 'tags',
            'featured_image', 'estimated_read_time', 'views_count',
            'likes_count', 'shares_count', 'average_rating', 'ratings_count',
            'author', 'author_name', 'author_details', 'is_published',
            'is_featured', 'published_at', 'created_at',
            'is_bookmarked', 'is_liked', 'user_rating', 'user_progress'
        ]
        read_only_fields = [
            'id', 'created_at', 'views_count', 'likes_count',
            'shares_count', 'average_rating', 'ratings_count'
        ]

    @extend_schema_field(serializers.CharField())
    def get_author_name(self, obj):
        if obj.author:
            return obj.author.get_full_name()
        return 'SkyShield Edu'

    @extend_schema_field(serializers.DictField())
    def get_author_details(self, obj):
        if obj.author:
            return {
                'id': str(obj.author.id),
                'email': obj.author.email,
                'username': obj.author.username,
                'full_name': obj.author.get_full_name(),
                'profile_picture': obj.author.profile_picture.url if obj.author.profile_picture else None
            }
        return None

    @extend_schema_field(serializers.BooleanField())
    def get_is_bookmarked(self, obj):
        flags = self.context.get('material_user_flags') or {}
        bookmarks = flags.get('bookmarks')
        if bookmarks is not None:
            return obj.id in bookmarks
        user = self.context.get('user')
        if user and user.is_authenticated:
            return MaterialBookmark.objects.filter(user=user, material=obj).exists()
        return False

    @extend_schema_field(serializers.BooleanField())
    def get_is_liked(self, obj):
        flags = self.context.get('material_user_flags') or {}
        liked = flags.get('liked')
        if liked is not None:
            return obj.id in liked
        user = self.context.get('user')
        if user and user.is_authenticated:
            return obj.likes.filter(user=user).exists()
        return False

    @extend_schema_field(serializers.IntegerField(allow_null=True))
    def get_user_rating(self, obj):
        flags = self.context.get('material_user_flags') or {}
        ratings = flags.get('ratings')
        if ratings is not None:
            return ratings.get(obj.id)
        user = self.context.get('user')
        if user and user.is_authenticated:
            rating = obj.ratings.filter(user=user).first()
            return rating.rating if rating else None
        return None

    @extend_schema_field(serializers.DictField(allow_null=True))
    def get_user_progress(self, obj):
        flags = self.context.get('material_user_flags') or {}
        progress_map = flags.get('progress')
        if progress_map is not None:
            return progress_map.get(obj.id)
        user = self.context.get('user')
        if user and user.is_authenticated:
            progress = obj.user_progress.filter(user=user).first()
            if progress:
                return {
                    'completed': progress.completed,
                    'percentage': progress.progress_percentage,
                }
        return None


class LearningMaterialDetailSerializer(serializers.ModelSerializer):
    category = ContentCategorySerializer(read_only=True)
    author = serializers.SerializerMethodField()
    comments = serializers.SerializerMethodField()
    is_bookmarked = serializers.SerializerMethodField()
    is_liked = serializers.SerializerMethodField()
    user_rating = serializers.SerializerMethodField()
    user_progress = serializers.SerializerMethodField()
    related_materials = serializers.SerializerMethodField()

    class Meta:
        model = LearningMaterial
        fields = [
            'id', 'title', 'slug', 'description', 'content',
            'material_type', 'category', 'difficulty', 'tags',
            'file', 'video_url', 'external_url',
            'featured_image', 'estimated_read_time',
            'views_count', 'downloads_count', 'likes_count',
            'shares_count', 'average_rating', 'ratings_count',
            'author', 'is_published', 'is_featured', 'published_at',
            'created_at', 'updated_at',
            'is_bookmarked', 'is_liked', 'user_rating', 'user_progress',
            'comments', 'related_materials'
        ]
        read_only_fields = [
            'id', 'created_at', 'updated_at', 'views_count',
            'downloads_count', 'likes_count', 'shares_count',
            'average_rating', 'ratings_count'
        ]

    @extend_schema_field(serializers.DictField(allow_null=True))
    def get_author(self, obj):
        if obj.author:
            return MaterialAuthorSerializer(obj.author).data
        return None

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_comments(self, obj):
        comments = obj.comments.filter(parent__isnull=True, is_deleted=False)[:10]
        return MaterialCommentSerializer(comments, many=True, context=self.context).data

    @extend_schema_field(serializers.BooleanField())
    def get_is_bookmarked(self, obj):
        user = self.context.get('user')
        if user and user.is_authenticated:
            return MaterialBookmark.objects.filter(user=user, material=obj).exists()
        return False

    @extend_schema_field(serializers.BooleanField())
    def get_is_liked(self, obj):
        user = self.context.get('user')
        if user and user.is_authenticated:
            return obj.likes.filter(user=user).exists()
        return False

    @extend_schema_field(serializers.IntegerField(allow_null=True))
    def get_user_rating(self, obj):
        user = self.context.get('user')
        if user and user.is_authenticated:
            rating = obj.ratings.filter(user=user).first()
            return rating.rating if rating else None
        return None

    @extend_schema_field(serializers.DictField(allow_null=True))
    def get_user_progress(self, obj):
        user = self.context.get('user')
        if user and user.is_authenticated:
            progress = obj.user_progress.filter(user=user).first()
            if progress:
                return {
                    'completed': progress.completed,
                    'percentage': progress.progress_percentage,
                    'started_at': progress.started_at,
                    'completed_at': progress.completed_at,
                }
        return None

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_related_materials(self, obj):
        related = LearningMaterial.objects.filter(
            is_published=True
        ).exclude(id=obj.id)[:5]
        return LearningMaterialListSerializer(related, many=True, context=self.context).data


# ==============================================================================
# MATERIAL INTERACTIONS
# ==============================================================================

class MaterialProgressSerializer(serializers.ModelSerializer):
    material_title = serializers.CharField(source='material.title', read_only=True)
    material_type = serializers.CharField(source='material.material_type', read_only=True)

    class Meta:
        model = MaterialProgress
        fields = [
            'id', 'user', 'material', 'material_title', 'material_type',
            'completed', 'progress_percentage',
            'started_at', 'completed_at', 'last_accessed'
        ]
        read_only_fields = ['id', 'started_at', 'last_accessed']


class MaterialBookmarkSerializer(serializers.ModelSerializer):
    material = LearningMaterialListSerializer(read_only=True)

    class Meta:
        model = MaterialBookmark
        fields = ['id', 'user', 'material', 'created_at']
        read_only_fields = ['id', 'user', 'created_at']


class MaterialCommentSerializer(serializers.ModelSerializer):
    user_details = serializers.SerializerMethodField()
    replies = serializers.SerializerMethodField()

    class Meta:
        model = MaterialComment
        fields = [
            'id', 'user', 'user_details', 'material', 'content',
            'parent', 'replies', 'is_edited', 'is_deleted',
            'likes_count', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'user', 'created_at', 'updated_at', 'is_edited', 'likes_count']

    @extend_schema_field(serializers.DictField())
    def get_user_details(self, obj):
        return {
            'id': str(obj.user.id),
            'email': obj.user.email,
            'username': obj.user.username,
            'full_name': obj.user.get_full_name(),
            'profile_picture': obj.user.profile_picture.url if obj.user.profile_picture else None,
            'role': obj.user.role
        }

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_replies(self, obj):
        replies = obj.replies.filter(is_deleted=False)
        return MaterialCommentSerializer(replies, many=True, context=self.context).data


class MaterialRatingSerializer(serializers.ModelSerializer):
    user_details = serializers.SerializerMethodField()

    class Meta:
        model = MaterialRating
        fields = [
            'id', 'user', 'user_details', 'material',
            'rating', 'review', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'user', 'created_at', 'updated_at']

    @extend_schema_field(serializers.DictField())
    def get_user_details(self, obj):
        return {
            'id': str(obj.user.id),
            'email': obj.user.email,
            'username': obj.user.username,
            'full_name': obj.user.get_full_name(),
            'profile_picture': obj.user.profile_picture.url if obj.user.profile_picture else None
        }


# ==============================================================================
# LEARNING PATH
# ==============================================================================

class LearningPathListSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    author_name = serializers.SerializerMethodField()
    material_count = serializers.SerializerMethodField()
    enrolled_count = serializers.SerializerMethodField()
    user_enrolled = serializers.SerializerMethodField()
    user_progress = serializers.SerializerMethodField()

    class Meta:
        model = LearningPath
        fields = [
            'id', 'title', 'slug', 'description', 'category', 'category_name',
            'difficulty', 'thumbnail', 'estimated_duration', 'tags',
            'prerequisites', 'enrolled_count', 'completion_rate',
            'author', 'author_name', 'is_featured', 'material_count',
            'user_enrolled', 'user_progress', 'created_at'
        ]
        read_only_fields = ['id', 'created_at', 'enrolled_count', 'completion_rate']

    @extend_schema_field(serializers.CharField())
    def get_author_name(self, obj):
        if obj.author:
            return obj.author.get_full_name()
        return 'SkyShield Edu'

    @extend_schema_field(serializers.IntegerField())
    def get_material_count(self, obj):
        annotated = getattr(obj, 'material_count', None)
        if annotated is not None:
            return annotated
        return obj.get_material_count()

    @extend_schema_field(serializers.IntegerField())
    def get_enrolled_count(self, obj):
        live = getattr(obj, 'enrollment_aggregate', None)
        if live is not None:
            return live
        return obj.enrolled_count

    @extend_schema_field(serializers.BooleanField())
    def get_user_enrolled(self, obj):
        path_ctx = self.context.get('path_user_context') or {}
        entry = path_ctx.get(obj.id)
        if entry is not None:
            return bool(entry.get('enrolled'))
        user = self.context.get('user')
        if user and user.is_authenticated:
            return PathEnrollment.objects.filter(user=user, path=obj).exists()
        return False

    @extend_schema_field(serializers.DictField(allow_null=True))
    def get_user_progress(self, obj):
        path_ctx = self.context.get('path_user_context') or {}
        entry = path_ctx.get(obj.id)
        if entry is not None:
            return entry.get('progress')
        user = self.context.get('user')
        if user and user.is_authenticated:
            enrollment = obj.enrollments.filter(user=user).first()
            if enrollment:
                return {
                    'status': enrollment.status,
                    'progress': enrollment.calculate_progress(),
                    'completed_materials': enrollment.completed_materials or []
                }
        return None


class LearningPathDetailSerializer(serializers.ModelSerializer):
    category = ContentCategorySerializer(read_only=True)
    author = serializers.SerializerMethodField()
    materials = serializers.SerializerMethodField()
    user_enrollment = serializers.SerializerMethodField()

    class Meta:
        model = LearningPath
        fields = [
            'id', 'title', 'slug', 'description', 'category',
            'difficulty', 'materials', 'estimated_duration', 'tags',
            'thumbnail', 'prerequisites', 'enrolled_count', 'completion_rate',
            'author', 'is_published', 'is_featured',
            'user_enrollment', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'enrolled_count', 'completion_rate']

    @extend_schema_field(serializers.DictField(allow_null=True))
    def get_author(self, obj):
        if obj.author:
            return MaterialAuthorSerializer(obj.author).data
        return None

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_materials(self, obj):
        materials = obj.materials.filter(is_published=True)
        return LearningMaterialListSerializer(materials, many=True, context=self.context).data

    @extend_schema_field(serializers.DictField(allow_null=True))
    def get_user_enrollment(self, obj):
        user = self.context.get('user')
        if user and user.is_authenticated:
            enrollment = obj.enrollments.filter(user=user).first()
            if enrollment:
                return {
                    'status': enrollment.status,
                    'progress': enrollment.calculate_progress(),
                    'completed_materials': enrollment.completed_materials or [],
                    'started_at': enrollment.started_at,
                    'completed_at': enrollment.completed_at,
                    'last_accessed': enrollment.last_accessed
                }
        return None


class PathEnrollmentSerializer(serializers.ModelSerializer):
    path = LearningPathListSerializer(read_only=True)
    progress_percentage = serializers.SerializerMethodField()

    class Meta:
        model = PathEnrollment
        fields = [
            'id', 'user', 'path', 'status',
            'completed_materials', 'progress_percentage',
            'started_at', 'completed_at', 'last_accessed'
        ]
        read_only_fields = ['id', 'user', 'started_at', 'last_accessed']

    @extend_schema_field(serializers.FloatField())
    def get_progress_percentage(self, obj):
        return obj.calculate_progress()


# ==============================================================================
# GLOSSARY / FAQ / ANNOUNCEMENTS
# ==============================================================================

class GlossaryTermSerializer(serializers.ModelSerializer):
    class Meta:
        model = GlossaryTerm
        fields = [
            'id', 'term', 'definition', 'abbreviation',
            'category', 'related_terms', 'references',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class FAQSerializer(serializers.ModelSerializer):
    class Meta:
        model = FAQ
        fields = [
            'id', 'question', 'answer', 'category',
            'order', 'is_published', 'views_count',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'views_count']


class AnnouncementSerializer(serializers.ModelSerializer):
    is_read = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    created_by_details = serializers.SerializerMethodField()

    class Meta:
        model = Announcement
        fields = [
            'id', 'title', 'content', 'priority',
            'target_roles', 'target_users',
            'publish_from', 'publish_until',
            'created_by', 'created_by_name', 'created_by_details',
            'is_active', 'created_at', 'updated_at', 'is_read'
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']

    @extend_schema_field(serializers.BooleanField())
    def get_is_read(self, obj):
        user = self.context.get('user')
        if user and user.is_authenticated:
            return AnnouncementRead.objects.filter(announcement=obj, user=user).exists()
        return False

    @extend_schema_field(serializers.CharField())
    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name()
        return 'System'

    @extend_schema_field(serializers.DictField(allow_null=True))
    def get_created_by_details(self, obj):
        if obj.created_by:
            return {
                'id': str(obj.created_by.id),
                'email': obj.created_by.email,
                'full_name': obj.created_by.get_full_name(),
                'role': obj.created_by.role
            }
        return None


# ==============================================================================
# SEARCH
# ==============================================================================

class SearchResultSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    title = serializers.CharField()
    type = serializers.CharField()
    description = serializers.CharField()
    url = serializers.CharField()
    score = serializers.FloatField()
    created_at = serializers.DateTimeField(allow_null=True, required=False)
    author_name = serializers.CharField(allow_null=True, required=False)