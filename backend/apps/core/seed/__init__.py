"""Database reset and seed orchestration."""
from __future__ import annotations

from .clear import clear_all_data
from .context import SeedContext
from .analytics_seed import seed_analytics
from .content_seed import seed_content
from .core_extra_seed import seed_core_extra
from .meetings_seed import seed_meetings
from .simulations_seed import seed_simulations
from .tutor_seed import seed_tutor
from .users_seed import seed_users


def run_full_seed(ctx: SeedContext, *, skip_clear: bool = False) -> None:
    if not skip_clear:
        clear_all_data(ctx.write)
    seed_users(ctx)
    seed_content(ctx)
    seed_simulations(ctx)
    seed_tutor(ctx)
    seed_meetings(ctx)
    seed_analytics(ctx)
    seed_core_extra(ctx)
