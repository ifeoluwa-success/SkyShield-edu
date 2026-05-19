"""Shared seeding context passed between seed modules."""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Any, Callable

from django.contrib.auth import get_user_model

User = get_user_model()


@dataclass
class SeedContext:
    scale_name: str
    scale: dict[str, int]
    password: str
    write: Callable[[str], None]
    rng: random.Random
    faker: Any = None

    admins: list = field(default_factory=list)
    supervisors: list = field(default_factory=list)
    instructors: list = field(default_factory=list)
    trainees: list = field(default_factory=list)
    all_users: list = field(default_factory=list)
    staff_users: list = field(default_factory=list)

    categories: list = field(default_factory=list)
    materials: list = field(default_factory=list)
    paths: list = field(default_factory=list)

    scenarios: list = field(default_factory=list)
    courses: list = field(default_factory=list)

    tutor_profiles: list = field(default_factory=list)
    meetings: list = field(default_factory=list)

    def staff_pool(self):
        return self.admins + self.supervisors + self.instructors

    def pick_trainee(self):
        return self.rng.choice(self.trainees)

    def pick_staff(self):
        return self.rng.choice(self.staff_pool())
