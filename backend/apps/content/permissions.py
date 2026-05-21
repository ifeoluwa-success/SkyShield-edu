from rest_framework import permissions


class IsContentStaff(permissions.BasePermission):
    """Admin, supervisor, or instructor — can manage announcements and similar content."""

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and getattr(request.user, 'role', None) in ('admin', 'supervisor', 'instructor')
        )
