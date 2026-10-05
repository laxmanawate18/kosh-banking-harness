"""Rate limits shared by every Kosh instance: one counter row per caller per minute, incremented atomically in the database."""

from __future__ import annotations

import time

from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from persistence import RateLimitRecord


def hit(db, key: str, limit: int) -> bool:
    """Count one request for `key` in the current minute; True when the caller is over `limit`.
    ponytail: fixed one-minute windows, so a burst straddling a minute boundary can reach 2x the limit; a sliding
    window (two-bucket weighting) is the upgrade if that ever matters."""
    window = int(time.time() // 60)
    insert = sqlite_insert if db.runtime.engine.dialect.name == "sqlite" else pg_insert
    statement = insert(RateLimitRecord).values(key=key[:200], window=window, count=1)
    statement = statement.on_conflict_do_update(index_elements=["key", "window"], set_={"count": RateLimitRecord.count + 1})
    with db.runtime.sessions.begin() as session:
        count = session.execute(statement.returning(RateLimitRecord.count)).scalar_one()
    return count > limit


def purge(db, keep_minutes: int = 10) -> int:
    with db.runtime.sessions.begin() as session:
        return session.execute(delete(RateLimitRecord).where(RateLimitRecord.window < int(time.time() // 60) - keep_minutes)).rowcount or 0
