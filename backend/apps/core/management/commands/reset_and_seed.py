"""
Reset all database rows (preserve schema) and load realistic development data.

Identifiers use UUIDs and alphanumeric reference codes (no [SEED] markers).
See apps/core/seed/realistic.py for generators.

Usage:
  python manage.py reset_and_seed --yes
  python manage.py reset_and_seed --yes --scale medium
  python manage.py reset_and_seed --yes --scale large --password 'MyDevPass123!'
  python manage.py seed_realistic --yes          # same pipeline, clearer name
  python manage.py reset_and_seed --seed-only --yes
  python manage.py reset_and_seed --clear-only --yes

Pinned accounts (password = --password, default SkyShieldSeed2026!):
  admin@skyshield.africa
  supervisor@skyshield.africa
  instructor@skyshield.africa
  trainee@skyshield.africa
"""
from __future__ import annotations

import random

from django.core.management.base import BaseCommand, CommandError

from apps.core.seed import run_full_seed
from apps.core.seed.clear import clear_all_data
from apps.core.seed.constants import DEFAULT_PASSWORD, SCALES
from apps.core.seed.context import SeedContext


class Command(BaseCommand):
    help = 'Clear all data (keep schema) and seed realistic SkyShield Edu test data.'

    def add_arguments(self, parser):
        parser.add_argument('--yes', action='store_true', help='Confirm destructive reset.')
        parser.add_argument('--scale', choices=tuple(SCALES.keys()), default='medium')
        parser.add_argument('--password', default=DEFAULT_PASSWORD)
        parser.add_argument('--seed-only', action='store_true', help='Do not flush; append data.')
        parser.add_argument('--clear-only', action='store_true', help='Flush only.')
        parser.add_argument('--seed', type=int, default=None, help='RNG seed for reproducibility.')

    def handle(self, *args, **options):
        if not options['yes']:
            raise CommandError('Refusing to run without --yes (deletes all rows).')
        if options['clear_only'] and options['seed_only']:
            raise CommandError('Use only one of --clear-only or --seed-only.')

        scale_name = options['scale']
        rng = random.Random(options['seed'])

        faker = None
        try:
            from faker import Faker
            faker = Faker('en_NG')
            if options['seed'] is not None:
                faker.seed_instance(options['seed'])
        except ImportError:
            self.stdout.write(self.style.WARNING('Faker not installed; using built-in name lists.'))

        ctx = SeedContext(
            scale_name=scale_name,
            scale=SCALES[scale_name],
            password=options['password'],
            write=self.stdout.write,
            rng=rng,
            faker=faker,
        )

        self.stdout.write(self.style.WARNING(
            f'Scale={scale_name} | flush={"skip" if options["seed_only"] else "yes"}'
        ))

        if not options['seed_only']:
            clear_all_data(ctx.write)

        if options['clear_only']:
            self.stdout.write(self.style.SUCCESS('Database cleared (schema preserved).'))
            return

        run_full_seed(ctx, skip_clear=True)
        self.stdout.write(self.style.SUCCESS('Seed complete.'))
        self._print_summary(options['password'])

    def _print_summary(self, password: str) -> None:
        from django.contrib.auth import get_user_model

        from apps.content.models import LearningMaterial
        from apps.simulations.models import Course, Scenario, SimulationSession

        User = get_user_model()
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('=== Seed summary ==='))
        self.stdout.write(f'  Users: {User.objects.count()}')
        self.stdout.write(f'  Scenarios: {Scenario.objects.count()}')
        self.stdout.write(f'  Courses: {Course.objects.count()}')
        self.stdout.write(f'  Simulation sessions: {SimulationSession.objects.count()}')
        self.stdout.write(f'  Learning materials: {LearningMaterial.objects.count()}')
        self.stdout.write('')
        self.stdout.write('  Pinned logins:')
        for email in (
            'admin@skyshield.africa',
            'supervisor@skyshield.africa',
            'instructor@skyshield.africa',
            'trainee@skyshield.africa',
        ):
            self.stdout.write(f'    {email}')
        self.stdout.write(f'  Password: {password}')
