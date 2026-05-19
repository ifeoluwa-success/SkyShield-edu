from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('simulations', '0005_missionparticipant_last_heartbeat'),
    ]

    operations = [
        migrations.AddField(
            model_name='scenario',
            name='requires_team_participation',
            field=models.BooleanField(
                default=False,
                help_text=(
                    'Team-training mode: every participant must acknowledge the briefing, '
                    'and only the lead operator advances mission steps.'
                ),
            ),
        ),
    ]
