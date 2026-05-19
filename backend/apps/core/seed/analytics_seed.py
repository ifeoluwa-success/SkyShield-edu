"""Seed analytics aggregates and ML metrics."""
from __future__ import annotations

from datetime import timedelta

from django.utils import timezone

from apps.analytics.models import (
    MLModelMetrics,
    PerformanceTrend,
    SkillAssessment,
    UserPerformance,
)

from .constants import SEED_TAG


def seed_analytics(ctx) -> None:
    ctx.write('Seeding analytics...')

    skills = [c[0] for c in SkillAssessment.SKILLS]
    for user in ctx.trainees:
        perf, _ = UserPerformance.objects.get_or_create(
            user=user,
            defaults={
                'total_simulations': ctx.rng.randint(0, 25),
                'total_time_spent': ctx.rng.randint(1000, 80000),
                'average_score': ctx.rng.uniform(45, 96),
                'average_accuracy': ctx.rng.uniform(50, 98),
                'category_scores': {'navigation': ctx.rng.uniform(50, 95)},
                'learning_curve': [ctx.rng.uniform(40, 90) for _ in range(6)],
                'weak_areas': ctx.rng.sample(['phishing', 'gps_spoofing'], k=1),
                'strong_areas': ['communication'],
                'recommended_difficulty': ctx.rng.choice(['beginner', 'intermediate', 'advanced']),
            },
        )
        for skill in ctx.rng.sample(skills, k=ctx.rng.randint(2, 4)):
            SkillAssessment.objects.get_or_create(
                user=user,
                skill=skill,
                defaults={
                    'level': ctx.rng.randint(1, 5),
                    'score': ctx.rng.uniform(40, 98),
                    'progress': ctx.rng.uniform(0.2, 1.0),
                },
            )
        for days_ago in range(0, 30, 7):
            PerformanceTrend.objects.get_or_create(
                user=user,
                period='weekly',
                date=(timezone.now() - timedelta(days=days_ago)).date(),
                defaults={
                    'simulations_completed': ctx.rng.randint(0, 5),
                    'average_score': ctx.rng.uniform(50, 95),
                    'total_time': ctx.rng.randint(100, 5000),
                },
            )

    MLModelMetrics.objects.get_or_create(
        model_name=f'{SEED_TAG} threat_classifier',
        version='1.2.0',
        defaults={
            'accuracy': 0.91,
            'precision': 0.88,
            'recall': 0.87,
            'f1_score': 0.875,
            'training_samples': 12000,
            'validation_samples': 3000,
        },
    )

    ctx.write('  Analytics records created.')
