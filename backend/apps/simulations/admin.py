from django.contrib import admin
from django.utils.html import format_html
from django.urls import reverse
from django.utils import timezone
from .models import (
    Scenario,
    ScenarioAssignment,
    SimulationSession,
    UserDecision,
    ScenarioFeedback,
    ScenarioAchievement,
    ScenarioComment,
    ScenarioBookmark,
    Course,
    CourseModule,
    CourseEnrollment,
    ModuleProgress,
    CourseCertificate,
)
import json


@admin.register(Scenario)
class ScenarioAdmin(admin.ModelAdmin):
    list_display = [
        'title', 'category_badge', 'threat_type_badge', 'difficulty_badge',
        'times_completed', 'average_score', 'is_active_badge',
        'is_featured_badge', 'created_at'
    ]
    list_filter = ['category', 'threat_type', 'difficulty', 'publish_status', 'is_active', 'is_featured']
    search_fields = ['title', 'description', 'tags']
    readonly_fields = ['id', 'times_completed', 'average_score', 'average_time', 
                      'created_at', 'updated_at', 'scenario_stats', 'steps_preview']
    date_hierarchy = 'created_at'
    actions = ['activate_scenarios', 'deactivate_scenarios', 'feature_scenarios']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('id', 'title', 'description', 'created_by')
        }),
        ('Classification', {
            'fields': ('category', 'threat_type', 'difficulty', 'tags', 'version')
        }),
        ('Content', {
            'fields': ('initial_state', 'steps_preview', 'correct_actions', 'hints', 
                      'learning_objectives', 'supporting_docs')
        }),
        ('Media', {
            'fields': ('thumbnail', 'intro_video'),
            'classes': ('collapse',)
        }),
        ('Settings', {
            'fields': ('estimated_time', 'points_possible', 'passing_score', 
                      'max_attempts', 'publish_status', 'is_active', 'is_featured')
        }),
        ('Statistics', {
            'fields': ('times_completed', 'average_score', 'average_time', 'scenario_stats'),
            'classes': ('collapse',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def category_badge(self, obj):
        colors = {
            'communication': 'blue',
            'navigation': 'green',
            'data_integrity': 'purple',
            'social_engineering': 'orange',
            'ransomware': 'red',
            'unauthorized_access': 'darkred',
        }
        color = colors.get(obj.category, 'gray')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 2px 8px; border-radius: 10px;">{}</span>',
            color, obj.get_category_display()
        )
    category_badge.short_description = 'Category'
    
    def threat_type_badge(self, obj):
        return obj.get_threat_type_display()
    threat_type_badge.short_description = 'Threat Type'
    
    def difficulty_badge(self, obj):
        colors = {
            'beginner': 'green',
            'intermediate': 'blue',
            'advanced': 'orange',
            'expert': 'red',
        }
        color = colors.get(obj.difficulty, 'gray')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 2px 8px; border-radius: 10px;">{}</span>',
            color, obj.get_difficulty_display()
        )
    difficulty_badge.short_description = 'Difficulty'
    
    def is_active_badge(self, obj):
        if obj.is_active:
            return format_html('<span style="color:green;font-weight:bold;">✓ Active</span>')
        return format_html('<span style="color:red;">✗ Inactive</span>')
    is_active_badge.short_description = 'Status'
    
    def is_featured_badge(self, obj):
        if obj.is_featured:
            return format_html('<span style="color:purple;font-weight:bold;">★ Featured</span>')
        return format_html('<span style="color:gray;">☆ Not Featured</span>')
    is_featured_badge.short_description = 'Featured'
    
    def steps_preview(self, obj):
        if obj.steps:
            return format_html('<pre>{}</pre>', json.dumps(obj.steps, indent=2)[:500] + '...')
        return 'No steps defined'
    steps_preview.short_description = 'Steps Preview'
    
    def scenario_stats(self, obj):
        sessions_url = reverse('admin:simulations_simulationsession_changelist') + f'?scenario__id__exact={obj.id}'
        return format_html(
            '<div style="background:#f8f9fa;padding:10px;">'
            '<strong>Times Completed:</strong> {}<br>'
            '<strong>Average Score:</strong> {}%<br>'
            '<strong>Average Time:</strong> {} mins<br>'
            '<strong>Sessions:</strong> <a href="{}">View Sessions</a>'
            '</div>',
            obj.times_completed,
            round(obj.average_score, 2),
            round(obj.average_time / 60, 2) if obj.average_time else 0,
            sessions_url
        )
    scenario_stats.short_description = 'Statistics'
    
    def activate_scenarios(self, request, queryset):
        updated = queryset.update(is_active=True)
        self.message_user(request, f'{updated} scenarios activated.')
    activate_scenarios.short_description = "Activate selected scenarios"
    
    def deactivate_scenarios(self, request, queryset):
        updated = queryset.update(is_active=False)
        self.message_user(request, f'{updated} scenarios deactivated.')
    deactivate_scenarios.short_description = "Deactivate selected scenarios"
    
    def feature_scenarios(self, request, queryset):
        updated = queryset.update(is_featured=True)
        self.message_user(request, f'{updated} scenarios featured.')
    feature_scenarios.short_description = "Feature selected scenarios"


@admin.register(SimulationSession)
class SimulationSessionAdmin(admin.ModelAdmin):
    list_display = [
        'user_link', 'scenario_link', 'status_badge', 'score',
        'accuracy_rate', 'time_spent_display', 'passed_badge',
        'started_at', 'completed_at'
    ]
    list_filter = ['status', 'passed', 'started_at', 'scenario__difficulty']
    search_fields = ['user__email', 'user__username', 'scenario__title']
    readonly_fields = ['id', 'started_at', 'completed_at', 'last_activity', 
                      'session_details', 'decisions_preview', 'mistakes_preview']
    date_hierarchy = 'started_at'
    actions = ['mark_as_completed', 'mark_as_failed']
    
    fieldsets = (
        ('Session Information', {
            'fields': ('id', 'user', 'scenario', 'attempt_number')
        }),
        ('Status', {
            'fields': ('status', 'passed', 'current_step')
        }),
        ('Performance', {
            'fields': ('score', 'time_spent', 'correct_choices', 'total_choices',
                      'accuracy_rate', 'hints_used', 'session_details')
        }),
        ('State', {
            'fields': ('session_state', 'feedback'),
            'classes': ('collapse',)
        }),
        ('Decisions', {
            'fields': ('decisions_preview',),
            'classes': ('collapse',)
        }),
        ('Mistakes', {
            'fields': ('mistakes_preview',),
            'classes': ('collapse',)
        }),
        ('Timestamps', {
            'fields': ('started_at', 'completed_at', 'last_activity'),
            'classes': ('collapse',)
        }),
    )
    
    def user_link(self, obj):
        url = reverse('admin:users_user_change', args=[obj.user.id])
        return format_html('<a href="{}">{}</a>', url, obj.user.email)
    user_link.short_description = 'User'
    
    def scenario_link(self, obj):
        url = reverse('admin:simulations_scenario_change', args=[obj.scenario.id])
        return format_html('<a href="{}">{}</a>', url, obj.scenario.title)
    scenario_link.short_description = 'Scenario'
    
    def status_badge(self, obj):
        colors = {
            'not_started': 'gray',
            'in_progress': 'blue',
            'completed': 'green',
            'failed': 'red',
            'abandoned': 'orange',
        }
        color = colors.get(obj.status, 'gray')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 2px 8px; border-radius: 10px;">{}</span>',
            color, obj.get_status_display()
        )
    status_badge.short_description = 'Status'
    
    def passed_badge(self, obj):
        if obj.passed:
            return format_html('<span style="color:green;">✓ Passed</span>')
        return format_html('<span style="color:red;">✗ Failed</span>')
    passed_badge.short_description = 'Passed'
    
    def time_spent_display(self, obj):
        minutes = obj.time_spent // 60
        seconds = obj.time_spent % 60
        return f"{minutes}:{seconds:02d}"
    time_spent_display.short_description = 'Time Spent'
    
    def session_details(self, obj):
        return format_html(
            '<div>'
            '<strong>Correct:</strong> {} / {}<br>'
            '<strong>Accuracy:</strong> {}%<br>'
            '<strong>Hints Used:</strong> {}<br>'
            '<strong>Attempt:</strong> {} of {}'
            '</div>',
            obj.correct_choices,
            obj.total_choices,
            round(obj.accuracy_rate, 2),
            obj.hints_used,
            obj.attempt_number,
            obj.scenario.max_attempts if obj.scenario else 'N/A'
        )
    session_details.short_description = 'Details'
    
    def decisions_preview(self, obj):
        decisions = obj.user_decisions.all().order_by('step_number')
        if not decisions:
            return "No decisions recorded"
        
        html = '<table style="width:100%; border-collapse: collapse;">'
        html += '<tr><th>Step</th><th>Type</th><th>Correct</th><th>Time</th></tr>'
        for d in decisions[:10]:
            color = 'lightgreen' if d.is_correct else '#ffcccc'
            html += f'<tr style="background-color: {color};">'
            html += f'<td>{d.step_number}</td>'
            html += f'<td>{d.get_decision_type_display()}</td>'
            html += f'<td>{"✓" if d.is_correct else "✗"}</td>'
            html += f'<td>{d.time_taken}s</td>'
            html += '</tr>'
        html += '</table>'
        if decisions.count() > 10:
            html += f'<p>... and {decisions.count() - 10} more</p>'
        return format_html(html)
    decisions_preview.short_description = 'Decisions'
    
    def mistakes_preview(self, obj):
        if obj.mistakes:
            return format_html('<pre>{}</pre>', json.dumps(obj.mistakes, indent=2))
        return 'No mistakes recorded'
    mistakes_preview.short_description = 'Mistakes'
    
    def mark_as_completed(self, request, queryset):
        updated = queryset.filter(status='in_progress').update(
            status='completed',
            completed_at=timezone.now()
        )
        self.message_user(request, f'{updated} sessions marked as completed.')
    mark_as_completed.short_description = "Mark as completed"
    
    def mark_as_failed(self, request, queryset):
        updated = queryset.filter(status='in_progress').update(
            status='failed',
            completed_at=timezone.now(),
            passed=False
        )
        self.message_user(request, f'{updated} sessions marked as failed.')
    mark_as_failed.short_description = "Mark as failed"


@admin.register(UserDecision)
class UserDecisionAdmin(admin.ModelAdmin):
    list_display = ['session_link', 'step_number', 'decision_type_display', 
                   'correct_badge', 'time_taken', 'created_at']
    list_filter = ['decision_type', 'is_correct', 'created_at']
    search_fields = ['session__user__email', 'session__scenario__title']
    readonly_fields = ['created_at', 'decision_data_preview']
    
    def session_link(self, obj):
        url = reverse('admin:simulations_simulationsession_change', args=[obj.session.id])
        return format_html('<a href="{}">Session {}</a>', url, str(obj.session.id)[:8])
    session_link.short_description = 'Session'
    
    def decision_type_display(self, obj):
        return obj.get_decision_type_display()
    decision_type_display.short_description = 'Type'
    
    def correct_badge(self, obj):
        if obj.is_correct:
            return format_html('<span style="color:green;">✓ Correct</span>')
        return format_html('<span style="color:red;">✗ Incorrect</span>')
    correct_badge.short_description = 'Correct'
    
    def decision_data_preview(self, obj):
        return format_html('<pre>{}</pre>', json.dumps(obj.decision_data, indent=2))
    decision_data_preview.short_description = 'Decision Data'


@admin.register(ScenarioFeedback)
class ScenarioFeedbackAdmin(admin.ModelAdmin):
    list_display = ['user_link', 'scenario_link', 'rating_stars', 
                   'difficulty_rating_stars', 'created_at']
    list_filter = ['rating', 'difficulty_rating', 'created_at']
    search_fields = ['user__email', 'scenario__title', 'comments']
    readonly_fields = ['created_at']
    
    def user_link(self, obj):
        url = reverse('admin:users_user_change', args=[obj.user.id])
        return format_html('<a href="{}">{}</a>', url, obj.user.email)
    user_link.short_description = 'User'
    
    def scenario_link(self, obj):
        url = reverse('admin:simulations_scenario_change', args=[obj.scenario.id])
        return format_html('<a href="{}">{}</a>', url, obj.scenario.title)
    scenario_link.short_description = 'Scenario'
    
    def rating_stars(self, obj):
        stars = '★' * obj.rating + '☆' * (5 - obj.rating)
        colors = ['red', 'orange', 'gold', 'lightgreen', 'green']
        return format_html('<span style="color: {};">{}</span>', colors[obj.rating-1], stars)
    rating_stars.short_description = 'Rating'
    
    def difficulty_rating_stars(self, obj):
        stars = '★' * obj.difficulty_rating + '☆' * (5 - obj.difficulty_rating)
        colors = ['green', 'lightgreen', 'gold', 'orange', 'red']
        return format_html('<span style="color: {};">{}</span>', colors[obj.difficulty_rating-1], stars)
    difficulty_rating_stars.short_description = 'Difficulty'


@admin.register(ScenarioAchievement)
class ScenarioAchievementAdmin(admin.ModelAdmin):
    list_display = ['user_link', 'scenario_link', 'achievement_type_display', 'earned_at']
    list_filter = ['achievement_type', 'earned_at']
    search_fields = ['user__email', 'scenario__title']
    readonly_fields = ['earned_at']
    
    def user_link(self, obj):
        url = reverse('admin:users_user_change', args=[obj.user.id])
        return format_html('<a href="{}">{}</a>', url, obj.user.email)
    user_link.short_description = 'User'
    
    def scenario_link(self, obj):
        url = reverse('admin:simulations_scenario_change', args=[obj.scenario.id])
        return format_html('<a href="{}">{}</a>', url, obj.scenario.title)
    scenario_link.short_description = 'Scenario'
    
    def achievement_type_display(self, obj):
        return obj.get_achievement_type_display()
    achievement_type_display.short_description = 'Achievement'


@admin.register(ScenarioComment)
class ScenarioCommentAdmin(admin.ModelAdmin):
    list_display = ['user_link', 'scenario_link', 'content_short', 'created_at']
    list_filter = ['created_at']
    search_fields = ['user__email', 'scenario__title', 'content']
    readonly_fields = ['created_at', 'updated_at']
    
    def user_link(self, obj):
        url = reverse('admin:users_user_change', args=[obj.user.id])
        return format_html('<a href="{}">{}</a>', url, obj.user.email)
    user_link.short_description = 'User'
    
    def scenario_link(self, obj):
        url = reverse('admin:simulations_scenario_change', args=[obj.scenario.id])
        return format_html('<a href="{}">{}</a>', url, obj.scenario.title)
    scenario_link.short_description = 'Scenario'
    
    def content_short(self, obj):
        return obj.content[:50] + '...' if len(obj.content) > 50 else obj.content
    content_short.short_description = 'Comment'


@admin.register(ScenarioBookmark)
class ScenarioBookmarkAdmin(admin.ModelAdmin):
    list_display = ['user_link', 'scenario_link', 'created_at']
    list_filter = ['created_at']
    search_fields = ['user__email', 'scenario__title']
    
    def user_link(self, obj):
        url = reverse('admin:users_user_change', args=[obj.user.id])
        return format_html('<a href="{}">{}</a>', url, obj.user.email)
    user_link.short_description = 'User'
    
    def scenario_link(self, obj):
        url = reverse('admin:simulations_scenario_change', args=[obj.scenario.id])
        return format_html('<a href="{}">{}</a>', url, obj.scenario.title)
    scenario_link.short_description = 'Scenario'


# --- Structured courses (linked to scenarios for simulation checkpoints) ---


@admin.register(Course)
class CourseAdmin(admin.ModelAdmin):
    list_display = ['title', 'threat_focus', 'is_published', 'created_by', 'created_at']
    list_filter = ['is_published', 'difficulty']
    search_fields = ['title', 'threat_focus']
    readonly_fields = ['id', 'created_at', 'updated_at']


@admin.register(CourseModule)
class CourseModuleAdmin(admin.ModelAdmin):
    list_display = ['title', 'course', 'module_type', 'position', 'scenario']
    list_filter = ['module_type']
    search_fields = ['title', 'course__title']
    ordering = ['course', 'position']


class ModuleProgressInline(admin.TabularInline):
    model = ModuleProgress
    extra = 0
    readonly_fields = ['module', 'status', 'attempts', 'best_score', 'passed_at']


@admin.register(CourseEnrollment)
class CourseEnrollmentAdmin(admin.ModelAdmin):
    list_display = ['trainee', 'course', 'status', 'enrolled_at', 'completed_at']
    list_filter = ['status']
    search_fields = ['trainee__email', 'course__title']
    inlines = [ModuleProgressInline]
    readonly_fields = ['id', 'enrolled_at']


@admin.register(CourseCertificate)
class CourseCertificateAdmin(admin.ModelAdmin):
    list_display = ['certificate_number', 'enrollment', 'final_score', 'issued_at']
    search_fields = ['certificate_number', 'enrollment__trainee__email']
    readonly_fields = ['id', 'issued_at']


@admin.register(ScenarioAssignment)
class ScenarioAssignmentAdmin(admin.ModelAdmin):
    list_display = [
        'scenario', 'trainee', 'status', 'max_attempts', 'cooldown_hours',
        'assigned_by', 'created_at',
    ]
    list_filter = ['status', 'scenario__category']
    search_fields = ['trainee__email', 'scenario__title', 'assigned_by__email']
    readonly_fields = ['id', 'created_at', 'updated_at']
    raw_id_fields = ['scenario', 'trainee', 'assigned_by']