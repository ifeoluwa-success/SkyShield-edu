from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'categories', views.ContentCategoryViewSet, basename='category')
router.register(r'materials', views.LearningMaterialViewSet, basename='material')
router.register(r'paths', views.LearningPathViewSet, basename='path')
router.register(r'glossary', views.GlossaryViewSet, basename='glossary')
router.register(r'faqs', views.FAQViewSet, basename='faq')
router.register(r'announcements', views.AnnouncementViewSet, basename='announcement')
router.register(r'bookmarks', views.MaterialBookmarkViewSet, basename='bookmark')

urlpatterns = [
    path('', include(router.urls)),
    path('search/', views.SearchView.as_view(), name='search'),
    path('materials/<slug:material_slug>/comments/',
         views.MaterialCommentViewSet.as_view({'get': 'list', 'post': 'create'}),
         name='material-comments'),
    path('materials/<slug:material_slug>/comments/<uuid:pk>/',
         views.MaterialCommentViewSet.as_view({
             'get': 'retrieve', 'put': 'update', 'patch': 'partial_update', 'delete': 'destroy',
         }),
         name='material-comment-detail'),
]