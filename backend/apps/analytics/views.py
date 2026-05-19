from rest_framework import status, generics, permissions, serializers
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import Avg, Count, Sum
from django.utils import timezone
from datetime import timedelta
from django.apps import apps
from drf_spectacular.utils import extend_schema
from .models import UserPerformance, PerformanceTrend, SkillAssessment
from .serializers import (
    UserPerformanceSerializer, PerformanceTrendSerializer,
    SkillAssessmentSerializer, DashboardStatsSerializer
)
import logging

logger = logging.getLogger(__name__)


# ==============================================================================
# SERIALIZERS FOR APIVIEWS
# ==============================================================================

class DashboardStatsResponseSerializer(serializers.Serializer):
    total_simulations = serializers.IntegerField()
    completed_simulations = serializers.IntegerField()
    average_score = serializers.FloatField()
    total_time = serializers.IntegerField()
    weekly_simulations = serializers.IntegerField()
    category_stats = serializers.ListField(child=serializers.DictField())
    recent_activity = serializers.ListField(child=serializers.DictField())
    trend_data = serializers.DictField()
    weak_areas = serializers.ListField(child=serializers.CharField())
    strong_areas = serializers.ListField(child=serializers.CharField())
    recommended_scenarios = serializers.ListField(child=serializers.UUIDField())
    skill_level = serializers.DictField()


class LearningPathResponseSerializer(serializers.Serializer):
    scenario_id = serializers.UUIDField()
    title = serializers.CharField()
    difficulty = serializers.CharField()
    category = serializers.CharField()
    estimated_time = serializers.IntegerField()
    reason = serializers.CharField()


class ComparisonResponseSerializer(serializers.Serializer):
    user = serializers.DictField()
    global_stats = serializers.DictField()
    peers = serializers.DictField()
    percentile = serializers.FloatField()


# ==============================================================================
# API VIEWS
# ==============================================================================

class DashboardStatsView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    
    @extend_schema(
        responses={200: DashboardStatsResponseSerializer()}
    )
    def get(self, request):
        user = request.user
        today = timezone.now().date()
        week_ago = today - timedelta(days=7)
        
        # Lazy load models to avoid circular imports
        SimulationSession = apps.get_model('simulations', 'SimulationSession')
        UserActivity = apps.get_model('users', 'UserActivity')
        
        completed_simulations = SimulationSession.objects.filter(
            user=user, status='completed'
        )
        total_simulations = completed_simulations.count()

        agg = completed_simulations.aggregate(
            avg_score=Avg('score'),
            total_time=Sum('time_spent'),
        )
        avg_score = agg['avg_score'] or 0
        total_time = agg['total_time'] or 0

        weekly_sims = completed_simulations.filter(
            completed_at__date__gte=week_ago
        ).count()

        category_stats = [
            {
                'category': row['scenario__category'],
                'count': row['count'],
                'avg_score': round(row['avg_score'] or 0, 2),
            }
            for row in completed_simulations.values('scenario__category')
            .annotate(count=Count('id'), avg_score=Avg('score'))
            .filter(count__gt=0)
        ]
        
        # Recent activity
        recent_activity = UserActivity.objects.filter(
            user=user
        )[:10].values('activity_type', 'timestamp', 'metadata')
        
        # Performance trend
        trends = PerformanceTrend.objects.filter(
            user=user,
            period='daily',
            date__gte=week_ago
        ).order_by('date')
        
        trend_data = {
            'dates': [t.date.strftime('%Y-%m-%d') for t in trends],
            'scores': [float(t.average_score) for t in trends],
            'counts': [t.simulations_completed for t in trends]
        }
        
        # Get or create performance
        performance, created = UserPerformance.objects.get_or_create(user=user)
        
        data = {
            'total_simulations': total_simulations,
            'completed_simulations': total_simulations,
            'average_score': round(avg_score, 2),
            'total_time': total_time,
            'weekly_simulations': weekly_sims,
            'category_stats': category_stats,
            'recent_activity': list(recent_activity),
            'trend_data': trend_data,
            'weak_areas': performance.weak_areas if performance.weak_areas else [],
            'strong_areas': performance.strong_areas if performance.strong_areas else [],
            'recommended_scenarios': performance.recommended_scenarios if performance.recommended_scenarios else [],
            'skill_level': performance.skill_levels if performance.skill_levels else {}
        }
        
        serializer = DashboardStatsSerializer(data=data)
        serializer.is_valid()
        return Response(serializer.data)


class PerformanceView(generics.RetrieveAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = UserPerformanceSerializer
    
    def get_object(self):
        obj, created = UserPerformance.objects.get_or_create(user=self.request.user)
        return obj


class PerformanceTrendsView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = PerformanceTrendSerializer
    
    def get_queryset(self):
        period = self.request.query_params.get('period', 'daily')
        days = int(self.request.query_params.get('days', 30))
        start_date = timezone.now().date() - timedelta(days=days)
        
        return PerformanceTrend.objects.filter(
            user=self.request.user,
            period=period,
            date__gte=start_date
        ).order_by('date')


class SkillAssessmentsView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = SkillAssessmentSerializer
    
    def get_queryset(self):
        return SkillAssessment.objects.filter(user=self.request.user)


class LearningPathView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    
    @extend_schema(
        responses={200: LearningPathResponseSerializer(many=True)}
    )
    def get(self, request):
        user = request.user
        performance, created = UserPerformance.objects.get_or_create(user=user)
        
        # Lazy load Scenario model
        Scenario = apps.get_model('simulations', 'Scenario')
        
        learning_path = []
        
        # Check if performance has weak_areas
        weak_areas = performance.weak_areas if performance.weak_areas else []
        
        for area in weak_areas[:3]:
            try:
                scenarios = Scenario.objects.filter(
                    threat_type=area,
                    is_active=True
                ).order_by('difficulty')[:3]
                
                for scenario in scenarios:
                    learning_path.append({
                        'scenario_id': str(scenario.id),
                        'title': scenario.title,
                        'difficulty': scenario.difficulty,
                        'category': scenario.category,
                        'estimated_time': scenario.estimated_time,
                        'reason': f"Improve your {area} skills"
                    })
            except Exception as e:
                logger.error(f"Error generating learning path for area {area}: {e}")
                continue
        
        # If no learning path from weak areas, recommend beginner scenarios
        if not learning_path:
            try:
                beginner_scenarios = Scenario.objects.filter(
                    difficulty='beginner',
                    is_active=True
                )[:5]
                
                for scenario in beginner_scenarios:
                    learning_path.append({
                        'scenario_id': str(scenario.id),
                        'title': scenario.title,
                        'difficulty': scenario.difficulty,
                        'category': scenario.category,
                        'estimated_time': scenario.estimated_time,
                        'reason': "Start with beginner scenarios"
                    })
            except Exception as e:
                logger.error(f"Error generating beginner scenarios: {e}")
        
        return Response(learning_path)


class ComparisonView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    
    @extend_schema(
        responses={200: ComparisonResponseSerializer()}
    )
    def get(self, request):
        user = request.user
        
        # Lazy load models
        SimulationSession = apps.get_model('simulations', 'SimulationSession')
        
        # Get user's stats
        user_stats = SimulationSession.objects.filter(
            user=user, status='completed'
        ).aggregate(
            avg_score=Avg('score'),
            total_time=Sum('time_spent'),
            total_sims=Count('id')
        )
        
        # Get global averages
        global_stats = SimulationSession.objects.filter(
            status='completed'
        ).aggregate(
            avg_score=Avg('score'),
            avg_time=Avg('time_spent')
        )
        
        # Get peer group (same role/organization)
        peer_stats = SimulationSession.objects.filter(
            user__role=user.role,
            user__organization=user.organization,
            status='completed'
        ).exclude(user=user).aggregate(
            avg_score=Avg('score'),
            avg_time=Avg('time_spent')
        )
        
        # Calculate percentile
        percentile = self.calculate_percentile(user)
        
        return Response({
            'user': {
                'avg_score': round(user_stats['avg_score'] or 0, 2),
                'total_time': user_stats['total_time'] or 0,
                'total_sims': user_stats['total_sims'] or 0
            },
            'global': {
                'avg_score': round(global_stats['avg_score'] or 0, 2),
                'avg_time': round(global_stats['avg_time'] or 0, 2)
            },
            'peers': {
                'avg_score': round(peer_stats['avg_score'] or 0, 2),
                'avg_time': round(peer_stats['avg_time'] or 0, 2)
            },
            'percentile': percentile
        })
    
    def calculate_percentile(self, user):
        """Calculate user's percentile based on score"""
        try:
            user_performance = UserPerformance.objects.get(user=user)
            all_users = UserPerformance.objects.exclude(user=user).order_by('-average_score')
            
            if all_users.count() == 0:
                return 50
            
            better_users = all_users.filter(
                average_score__gt=user_performance.average_score
            ).count()
            
            percentile = (better_users / all_users.count()) * 100
            return round(100 - percentile, 2)
        except UserPerformance.DoesNotExist:
            return 50
        except Exception as e:
            logger.error(f"Error calculating percentile: {e}")
            return 50