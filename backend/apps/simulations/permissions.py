"""Role helpers for simulation staff APIs and mission access."""

from django.db.models import Q
from rest_framework import permissions

STAFF_SCENARIO_ROLES = frozenset({'supervisor', 'admin', 'instructor'})
SCENARIO_WRITE_ROLES = frozenset({'supervisor', 'admin'})
PLATFORM_ANALYTICS_ROLES = frozenset({'supervisor', 'admin', 'instructor'})
# Matches IncidentRunViewSet listing and supervisor intervention rules.
MISSION_SUPERVISE_ROLES = frozenset({'supervisor', 'admin'})
ACTIVE_ASSIGNMENT_STATUSES = ('assigned', 'in_progress')
ENDED_MISSION_STATUSES = ('completed', 'failed', 'abandoned')


def user_role(user) -> str:
    return getattr(user, 'role', None) or 'trainee'


def is_mission_supervisor(user) -> bool:
    return bool(
        user
        and getattr(user, 'is_authenticated', False)
        and user_role(user) in MISSION_SUPERVISE_ROLES
    )


def user_is_mission_participant(user, run) -> bool:
    from .models import MissionParticipant

    return MissionParticipant.objects.filter(run=run, user=user).exists()


def user_is_mission_host(user, run) -> bool:
    """Host is the first participant created by start_mission (IncidentRun has no host FK)."""
    from .models import MissionParticipant

    first_id = (
        MissionParticipant.objects.filter(run=run)
        .order_by('joined_at', 'id')
        .values_list('user_id', flat=True)
        .first()
    )
    return first_id is not None and first_id == getattr(user, 'pk', None)


def user_has_active_scenario_assignment(user, run) -> bool:
    from .models import ScenarioAssignment

    return ScenarioAssignment.objects.filter(
        trainee=user,
        scenario_id=run.scenario_id,
        status__in=ACTIVE_ASSIGNMENT_STATUSES,
    ).exists()


def user_can_access_mission(user, run) -> bool:
    """
    Server-side gate for a specific IncidentRun.

    Allowed: mission host, existing participant, active scenario assignment
    (invited/assigned trainee), or supervisor/admin. Authentication alone is
    not enough; instructors are staff but are not mission supervisors.
    """
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if is_mission_supervisor(user):
        return True
    if user_is_mission_participant(user, run) or user_is_mission_host(user, run):
        return True
    return user_has_active_scenario_assignment(user, run)


def incident_runs_queryset_for_user(user, queryset):
    """Restrict IncidentRun querysets to missions the user may access."""
    if is_mission_supervisor(user):
        return queryset.order_by('-started_at')
    if not user or not getattr(user, 'is_authenticated', False):
        return queryset.none()
    assigned_open = Q(
        scenario__assignments__trainee=user,
        scenario__assignments__status__in=ACTIVE_ASSIGNMENT_STATUSES,
    ) & ~Q(status__in=ENDED_MISSION_STATUSES)
    return queryset.filter(
        Q(mission_participants__user=user) | assigned_open
    ).distinct().order_by('-started_at')


class CanAccessIncidentRun(permissions.BasePermission):
    """Object-level check: host, participant, assigned trainee, or supervising staff."""

    def has_object_permission(self, request, view, obj):
        return user_can_access_mission(request.user, obj)


class IsScenarioStaff(permissions.BasePermission):
    """Read/manage catalog: supervisor, admin, instructor."""

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and user_role(request.user) in STAFF_SCENARIO_ROLES
        )


class IsScenarioAuthor(permissions.BasePermission):
    """Create, update, delete, assign: supervisor and admin only."""

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and user_role(request.user) in SCENARIO_WRITE_ROLES
        )


class IsPlatformAnalyticsStaff(permissions.BasePermission):
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and (
                user_role(request.user) in PLATFORM_ANALYTICS_ROLES
                or getattr(request.user, 'is_staff', False)
            )
        )
