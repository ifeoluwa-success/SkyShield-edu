"""Seed content app: categories, materials, paths, glossary, FAQ, announcements."""
from __future__ import annotations

from datetime import timedelta

from django.utils import timezone
from django.utils.text import slugify

from apps.content.models import (
    Announcement,
    AnnouncementRead,
    ContentCategory,
    FAQ,
    GlossaryTerm,
    LearningMaterial,
    LearningPath,
    MaterialBookmark,
    MaterialComment,
    MaterialProgress,
    MaterialRating,
    MaterialView,
    PathEnrollment,
)

from .constants import SEED_TAG, THREAT_TOPICS


def seed_content(ctx) -> None:
    ctx.write('Seeding content library...')

    cat_specs = [
        ('Aviation Security Fundamentals', 'avsec-fundamentals', 'shield'),
        ('Navigation & Surveillance', 'navigation-surveillance', 'radar'),
        ('Incident Response', 'incident-response', 'alert'),
        ('Regulatory Compliance', 'regulatory-compliance', 'book'),
        ('West Africa Case Studies', 'west-africa-cases', 'globe'),
    ]
    for name, slug, icon in cat_specs:
        cat, _ = ContentCategory.objects.get_or_create(
            slug=slug,
            defaults={'name': name, 'description': f'{SEED_TAG} {name}', 'icon': icon, 'order': len(ctx.categories)},
        )
        ctx.categories.append(cat)

    bodies = [
        '# Overview\n\nThis module covers threat indicators and coordinated response for ATM operations in Nigeria.',
        '# Learning outcomes\n\n1. Recognize spoofing signatures\n2. Apply SOP escalation\n3. Preserve evidence chains',
    ]

    for i in range(ctx.scale['materials']):
        topic = THREAT_TOPICS[i % len(THREAT_TOPICS)]
        cat = ctx.rng.choice(ctx.categories)
        title = f'{SEED_TAG} {topic[0]} — Study Guide'
        slug = slugify(title)[:260]
        base = slug
        n = 1
        while LearningMaterial.objects.filter(slug=slug).exists():
            slug = f'{base}-{n}'
            n += 1
        mat = LearningMaterial.objects.create(
            title=title,
            slug=slug,
            description=f'Comprehensive guide to {topic[0]} for Nigerian ATC and AVSEC trainees.',
            content=ctx.rng.choice(bodies),
            author=ctx.rng.choice(ctx.staff_users),
            category=cat,
            material_type=ctx.rng.choice(['article', 'video', 'document', 'presentation', 'quiz']),
            difficulty=ctx.rng.choice(['beginner', 'intermediate', 'advanced', 'expert']),
            tags=[topic[1], topic[2], 'nigeria', 'seed'],
            video_url='https://www.youtube.com/watch?v=dQw4w9WgXcQ' if ctx.rng.random() < 0.3 else '',
            external_url='https://www.icao.int/Security' if ctx.rng.random() < 0.25 else '',
            estimated_read_time=ctx.rng.randint(8, 45),
            is_published=True,
            is_featured=ctx.rng.random() < 0.12,
            published_at=timezone.now() - timedelta(days=ctx.rng.randint(5, 120)),
            views_count=ctx.rng.randint(10, 800),
            average_rating=round(ctx.rng.uniform(3.5, 5.0), 1),
            ratings_count=ctx.rng.randint(2, 40),
        )
        ctx.materials.append(mat)

    for p in range(ctx.scale['paths']):
        title = f'{SEED_TAG} Path: {ctx.rng.choice(["AVSEC Operator", "ATC Cyber", "Incident Commander"])} Track {p + 1}'
        slug = slugify(title)[:260]
        path = LearningPath.objects.create(
            title=title,
            slug=slug,
            description='Structured progression from fundamentals to advanced simulations.',
            author=ctx.rng.choice(ctx.instructors),
            category=ctx.rng.choice(ctx.categories),
            difficulty=ctx.rng.choice(['beginner', 'intermediate', 'advanced']),
            estimated_duration=ctx.rng.randint(120, 480),
            is_published=True,
            enrolled_count=0,
        )
        path.materials.set(ctx.rng.sample(ctx.materials, k=min(len(ctx.materials), ctx.rng.randint(4, 10))))
        ctx.paths.append(path)

        enrollees = ctx.rng.sample(ctx.trainees, k=min(len(ctx.trainees), ctx.rng.randint(8, 40)))
        for trainee in enrollees:
            mats = list(path.materials.all()[: ctx.rng.randint(0, path.materials.count())])
            PathEnrollment.objects.create(
                user=trainee,
                path=path,
                status=ctx.rng.choice(['enrolled', 'in_progress', 'completed']),
                completed_materials=[str(m.id) for m in mats],
            )
        path.enrolled_count = path.enrollments.count()
        path.save(update_fields=['enrolled_count'])

    for _ in range(25):
        mat = ctx.rng.choice(ctx.materials)
        trainee = ctx.rng.choice(ctx.trainees)
        MaterialProgress.objects.get_or_create(
            user=trainee,
            material=mat,
            defaults={
                'progress_percentage': ctx.rng.uniform(10, 100),
                'completed': ctx.rng.random() < 0.35,
            },
        )
        if ctx.rng.random() < 0.4:
            MaterialBookmark.objects.get_or_create(user=trainee, material=mat)
        if ctx.rng.random() < 0.5:
            MaterialRating.objects.get_or_create(
                user=trainee,
                material=mat,
                defaults={'rating': ctx.rng.randint(3, 5), 'review': 'Clear and relevant to our operations.'},
            )
        if ctx.rng.random() < 0.3:
            MaterialView.objects.create(user=trainee, material=mat, ip_address='127.0.0.1')
        if ctx.rng.random() < 0.15:
            MaterialComment.objects.create(
                user=trainee,
                material=mat,
                content='Useful scenario context for Lagos approach operations.',
            )

    glossary_cat = ctx.categories[0] if ctx.categories else None
    for term, definition in [
        ('ADS-B', 'Automatic Dependent Surveillance–Broadcast; position data used in ATM.'),
        ('TMA', 'Terminal Manoeuvring Area — controlled airspace around major airports.'),
        ('AVSEC', 'Aviation Security — protection against unlawful interference.'),
        ('NOTAM', 'Notice to Airmen — operational advisory.'),
    ]:
        GlossaryTerm.objects.get_or_create(
            term=term,
            defaults={'definition': definition, 'category': glossary_cat},
        )

    FAQ.objects.get_or_create(
        question=f'{SEED_TAG} How do I reset my simulation attempt?',
        defaults={
            'answer': 'Contact your supervisor or use the remaining attempts shown on the scenario card.',
            'category': ctx.categories[0] if ctx.categories else None,
        },
    )

    ann = Announcement.objects.create(
        title=f'{SEED_TAG} Q2 Training Intake Open',
        content='Enrollment for GPS spoofing response paths is open until month end.',
        priority='high',
        is_active=True,
        publish_from=timezone.now(),
        created_by=ctx.rng.choice(ctx.admins),
        target_roles=['trainee', 'instructor'],
    )
    for trainee in ctx.rng.sample(ctx.trainees, k=min(20, len(ctx.trainees))):
        AnnouncementRead.objects.get_or_create(user=trainee, announcement=ann)

    ctx.write(f'  Materials: {len(ctx.materials)}, paths: {len(ctx.paths)}.')
