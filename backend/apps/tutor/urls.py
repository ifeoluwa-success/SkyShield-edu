from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'materials', views.TeachingMaterialViewSet, basename='material')
router.register(r'sessions', views.TeachingSessionViewSet, basename='session')
router.register(r'exercises', views.ExerciseViewSet, basename='exercise')
router.register(r'students', views.StudentProgressViewSet, basename='student')
router.register(r'reports', views.ReportViewSet, basename='report')

urlpatterns = [
    path('', include(router.urls)),
    path('profile/', views.TutorProfileView.as_view(), name='tutor-profile'),
    path('dashboard/', views.TutorDashboardView.as_view(), name='tutor-dashboard'),
    path('sessions/<uuid:session_id>/attendance/',
         views.SessionAttendanceView.as_view(),
         name='session-attendance'),
    path('exercises/<uuid:exercise_id>/attempts/',
         views.ExerciseAttemptView.as_view(),
         name='exercise-attempts'),
    path('exercise-attempts/<uuid:pk>/',
         views.ExerciseAttemptDetailView.as_view(),
         name='exercise-attempt-detail'),  # <-- new endpoint

    # Trainee exercise endpoints
    path('trainee/meetings/track/',
         views.TraineeTrackMeetingView.as_view(),
         name='trainee-track-meeting'),
    path('trainee/exercises/status/',
         views.TraineeExerciseStatusView.as_view(),
         name='trainee-exercise-status'),
    path('trainee/exercises/',
         views.TraineeExerciseViewSet.as_view({'get': 'list'}),
         name='trainee-exercises'),
    path('trainee/exercises/submit/',
         views.TraineeExerciseSubmitView.as_view(),
         name='trainee-exercise-submit'),
]