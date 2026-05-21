"""Role helpers for simulation staff APIs."""

from rest_framework import permissions

STAFF_SCENARIO_ROLES = frozenset({'supervisor', 'admin', 'instructor'})
SCENARIO_WRITE_ROLES = frozenset({'supervisor', 'admin'})
PLATFORM_ANALYTICS_ROLES = frozenset({'supervisor', 'admin', 'instructor'})


def user_role(user) -> str:
    return getattr(user, 'role', None) or 'trainee'


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
