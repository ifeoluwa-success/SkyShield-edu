"""
Production-style identifiers and copy for database seeding.

All generated values are plain UUIDs / alphanumeric codes with no test markers.
"""
from __future__ import annotations

import secrets
import string
import uuid
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import random

_ALNUM = string.ascii_uppercase + string.digits


def uuid_str() -> str:
    """Standard UUID4 string (e.g. 7f3a2b1c-9e4d-4a8f-b2c1-6d8e0f1a2b3c)."""
    return str(uuid.uuid4())


def reference_code(prefix: str = 'SKY', *, length: int = 8) -> str:
    """Human-readable reference (e.g. SKY-K7M2X9P4)."""
    body = ''.join(secrets.choice(_ALNUM) for _ in range(length))
    return f'{prefix.upper()}-{body}'


def txn_reference() -> str:
    """Payment-style transaction id (e.g. TXN-A7F3B2E91C)."""
    return f'TXN-{secrets.token_hex(5).upper()}'


def employee_id(org: str, rng: random.Random) -> str:
    """Organisation staff number (e.g. NCAA-88421)."""
    prefix = ''.join(c for c in org.upper() if c.isalnum())[:4] or 'ORG'
    return f'{prefix}-{rng.randint(10000, 99999)}'


def session_token(*, nbytes: int = 16) -> str:
    """Opaque session / device token (32-char hex)."""
    return secrets.token_hex(nbytes)


def activity_metadata(rng: random.Random, activity_type: str) -> dict:
    """Audit-friendly activity payload without synthetic markers."""
    return {
        'correlation_id': uuid_str(),
        'activity': activity_type,
        'client': rng.choice(['web', 'mobile', 'api']),
        'request_id': reference_code('REQ', length=10),
    }


def incident_payload(rng: random.Random, event_type: str) -> dict:
    return {
        'correlation_id': uuid_str(),
        'event': event_type,
        'run_ref': reference_code('RUN'),
    }


def professional_bio(role: str, org: str) -> str:
    templates = {
        'admin': f'Platform operations lead at {org}, responsible for access governance and training compliance.',
        'supervisor': f'Training supervisor at {org} with oversight of simulation cohorts and incident debriefs.',
        'instructor': f'Aviation security instructor at {org}, delivering AVSEC and ATM cyber-defence modules.',
        'trainee': f'Operations trainee at {org}, progressing through navigation-security and incident-response pathways.',
    }
    return templates.get(role, f'Aviation cybersecurity professional at {org}.')


MEETING_TITLES = [
    'Weekly AVSEC Briefing',
    'Scenario Debrief — Lagos TMA',
    'ATC Cyber Workshop',
    'Incident Response Tabletop',
    'Navigation Security Office Hours',
    'Q2 Cohort Sync',
]

MATERIAL_SUFFIXES = [
    'Study Guide',
    'Operational Brief',
    'Field Reference',
    'Assessment Pack',
]

PATH_TRACKS = [
    'AVSEC Operator',
    'ATC Cyber Resilience',
    'Incident Commander',
    'Navigation Security Analyst',
]

NOTIFICATION_TITLES = [
    'Scheduled maintenance window',
    'New course module published',
    'Policy update — incident reporting',
    'Training deadline reminder',
    'Certificate available for download',
]

ANNOUNCEMENT_TITLES = [
    'Q2 Training Intake Now Open',
    'Simulation Lab Maintenance — Saturday',
    'Updated AVSEC Escalation Matrix',
    'New GPS Spoofing Response Path',
]
