"""Bulk lookups to avoid serializer N+1 queries."""
from __future__ import annotations

from uuid import UUID


def scenario_user_session_map(user, scenario_ids) -> dict:
    """
    Map scenario_id -> {'completed': True, 'score': float|None}
    One query; first row per scenario wins (ordered by -completed_at).
    """
    if not user or not getattr(user, 'is_authenticated', False) or not scenario_ids:
        return {}

    from .models import SimulationSession

    sessions = (
        SimulationSession.objects.filter(
            user=user,
            scenario_id__in=scenario_ids,
            status='completed',
        )
        .order_by('-completed_at')
        .only('scenario_id', 'score')
    )
    out: dict = {}
    for session in sessions:
        sid = session.scenario_id
        if sid not in out:
            out[sid] = {'completed': True, 'score': session.score}
    return out


def learning_material_user_context(user, material_ids) -> dict:
    """Flags for list serializers: bookmarks, likes, ratings, progress."""
    if not user or not getattr(user, 'is_authenticated', False) or not material_ids:
        return {
            'bookmarks': set(),
            'liked': set(),
            'ratings': {},
            'progress': {},
        }

    from apps.content.models import (
        MaterialBookmark,
        MaterialLike,
        MaterialProgress,
        MaterialRating,
    )

    bookmarks = set(
        MaterialBookmark.objects.filter(
            user=user, material_id__in=material_ids
        ).values_list('material_id', flat=True)
    )
    liked = set(
        MaterialLike.objects.filter(
            user=user, material_id__in=material_ids
        ).values_list('material_id', flat=True)
    )
    ratings = dict(
        MaterialRating.objects.filter(
            user=user, material_id__in=material_ids
        ).values_list('material_id', 'rating')
    )
    progress = {
        p.material_id: {
            'completed': p.completed,
            'percentage': p.progress_percentage,
        }
        for p in MaterialProgress.objects.filter(
            user=user, material_id__in=material_ids
        ).only('material_id', 'completed', 'progress_percentage')
    }
    return {
        'bookmarks': bookmarks,
        'liked': liked,
        'ratings': ratings,
        'progress': progress,
    }


def learning_path_user_context(user, path_ids) -> dict:
    """Map path_id -> enrollment progress dict."""
    if not user or not getattr(user, 'is_authenticated', False) or not path_ids:
        return {}

    from apps.content.models import PathEnrollment

    enrollments = PathEnrollment.objects.filter(
        user=user, path_id__in=path_ids
    ).select_related('path')
    out: dict = {}
    for enrollment in enrollments:
        out[enrollment.path_id] = {
            'enrolled': True,
            'progress': {
                'status': enrollment.status,
                'progress': enrollment.calculate_progress(),
                'completed_materials': enrollment.completed_materials or [],
            },
        }
    return out


def coerce_uuid_set(ids) -> list:
    """Normalize UUID primary keys for __in filters."""
    out = []
    for i in ids:
        if isinstance(i, UUID):
            out.append(i)
        else:
            try:
                out.append(UUID(str(i)))
            except (TypeError, ValueError):
                continue
    return out
