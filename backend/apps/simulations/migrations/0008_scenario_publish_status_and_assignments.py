# Generated manually for scenario management feature

import uuid
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('simulations', '0007_performance_indexes'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='scenario',
            name='publish_status',
            field=models.CharField(
                choices=[('draft', 'Draft'), ('active', 'Active'), ('archived', 'Archived')],
                db_index=True,
                default='active',
                max_length=20,
            ),
        ),
        migrations.CreateModel(
            name='ScenarioAssignment',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('max_attempts', models.PositiveIntegerField(blank=True, help_text='Overrides scenario.max_attempts when set.', null=True)),
                ('cooldown_hours', models.PositiveIntegerField(default=0, help_text='Minimum hours between attempts after a failed run.')),
                ('due_at', models.DateTimeField(blank=True, null=True)),
                ('status', models.CharField(choices=[('assigned', 'Assigned'), ('in_progress', 'In Progress'), ('completed', 'Completed'), ('expired', 'Expired'), ('revoked', 'Revoked')], default='assigned', max_length=20)),
                ('notes', models.TextField(blank=True)),
                ('notify_on_exhausted', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('assigned_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='scenarios_assigned', to=settings.AUTH_USER_MODEL)),
                ('scenario', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='assignments', to='simulations.scenario')),
                ('trainee', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='scenario_assignments', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'scenario_assignments',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='scenarioassignment',
            index=models.Index(fields=['trainee', 'status'], name='scenario_as_trainee__a1b2c3_idx'),
        ),
        migrations.AddIndex(
            model_name='scenarioassignment',
            index=models.Index(fields=['scenario', 'status'], name='scenario_as_scenario__d4e5f6_idx'),
        ),
        migrations.AddIndex(
            model_name='scenarioassignment',
            index=models.Index(fields=['assigned_by', '-created_at'], name='scenario_as_assigne__g7h8i9_idx'),
        ),
    ]
