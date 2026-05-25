"""
Load realistic development data (no synthetic [SEED] markers in titles or copy).

This is an alias for reset_and_seed with production-style identifiers (UUIDs,
SKY-XXXXXXXX refs, TXN- codes). Use --seed-only to append without flushing.

Examples:
  python manage.py seed_realistic --yes
  python manage.py seed_realistic --yes --scale large --password 'MyDevPass123!'
  python manage.py seed_realistic --yes --seed 42
"""
from apps.core.management.commands.reset_and_seed import Command as ResetAndSeedCommand


class Command(ResetAndSeedCommand):
    help = (
        'Clear the database (unless --seed-only) and load realistic SkyShield Edu '
        'data with production-style UUIDs and reference codes.'
    )
