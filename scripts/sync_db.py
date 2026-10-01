#!/usr/bin/env python3
"""Copy the Kosh database between the local development database and Cloud SQL.

Usage:
    python scripts/sync_db.py pull     # Cloud SQL -> local
    python scripts/sync_db.py push     # local -> Cloud SQL
    python scripts/sync_db.py status   # row counts side by side
    python scripts/sync_db.py watch    # push every time the local banking state changes

Every table in the schema is copied (upsert by primary key). The banking-state tables are mirrored exactly,
deletions included, so the target's banking data always equals the source's. Pushing from a local test database
therefore overwrites Cloud SQL's banking data: only push from a database whose data you want in the cloud.
"""

import argparse
import os
import sys
import threading
import time
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))
load_dotenv(ROOT_DIR / ".env")

from sqlalchemy import create_engine, func, select  # noqa: E402
from sqlalchemy.dialects.postgresql import insert as pg_insert  # noqa: E402
from sqlalchemy.dialects.sqlite import insert as sqlite_insert  # noqa: E402

import banking_store  # noqa: E402
from persistence import Base, BankDocumentRecord, BankingStateRecord  # noqa: E402

DEFAULT_CLOUD_URL = os.getenv("CLOUD_SQL_DATABASE_URL", "")
DEFAULT_LOCAL_URL = os.getenv("LOCAL_DATABASE_URL", f"sqlite+pysqlite:///{ROOT_DIR / 'data' / 'sentinel_local.sqlite3'}")

TABLES = Base.metadata.sorted_tables  # parents before children, so foreign keys hold while copying
STATE_TABLES = {BankDocumentRecord.__table__, *(spec.model.__table__ for spec in banking_store.SPECS.values())}


def get_engines(cloud_url: str = DEFAULT_CLOUD_URL, local_url: str = DEFAULT_LOCAL_URL):
    if not cloud_url:
        raise RuntimeError("CLOUD_SQL_DATABASE_URL must be provided through environment or secret storage")
    os.makedirs(ROOT_DIR / "data", exist_ok=True)
    local = create_engine(local_url)
    Base.metadata.create_all(local)
    return create_engine(cloud_url), local


def _copy(source, target, label: str, batch_size: int = 200) -> int:
    insert = sqlite_insert if target.dialect.name == "sqlite" else pg_insert
    started, total = time.time(), 0
    with source.connect() as src, target.begin() as dst:
        for table in TABLES:
            try:
                rows = [row._asdict() for row in src.execute(select(table))]
            except Exception as exc:
                print(f"  ⚠️ Could not read {table.name}: {exc}")
                continue
            if table in STATE_TABLES:
                dst.execute(table.delete())
            keys = [c.name for c in table.primary_key.columns]
            for i in range(0, len(rows), batch_size):
                stmt = insert(table).values(rows[i:i + batch_size])
                updates = {c.name: stmt.excluded[c.name] for c in table.columns if c.name not in keys}
                dst.execute(stmt.on_conflict_do_update(index_elements=keys, set_=updates) if updates and keys
                            else stmt.on_conflict_do_nothing())
            if rows:
                print(f"  ✓ {table.name}: {len(rows)} records")
                total += len(rows)
    print(f"✅ {label}: {total} records in {time.time() - started:.2f}s.\n")
    return total


def pull_from_cloud(c_engine, l_engine) -> int:
    return _copy(c_engine, l_engine, "Pull from Cloud SQL")


def push_to_cloud(c_engine, l_engine) -> int:
    return _copy(l_engine, c_engine, "Push to Cloud SQL")


def print_status(c_engine, l_engine) -> None:
    print(f"\n{'Table':<25} | {'Local':<8} | {'Cloud':<8} | Status")
    with l_engine.connect() as local, c_engine.connect() as cloud:
        for table in TABLES:
            counts = []
            for conn in (local, cloud):
                try:
                    counts.append(conn.execute(select(func.count()).select_from(table)).scalar())
                except Exception:
                    counts.append("-")
            print(f"{table.name:<25} | {str(counts[0]):<8} | {str(counts[1]):<8} | {'in sync' if counts[0] == counts[1] else 'differs'}")


def _push_on_change(c_engine, l_engine, interval: int, stop: threading.Event) -> None:
    """Push whenever the local banking-state version moves."""
    last = None
    while not stop.is_set():
        try:
            with l_engine.connect() as conn:
                current = conn.execute(select(BankingStateRecord.version).where(BankingStateRecord.id == 1)).scalar() or 0
            if last is not None and current != last:
                print(f"⚡ Banking state v{last} -> v{current}: replicating to Cloud SQL")
                push_to_cloud(c_engine, l_engine)
            last = current
        except Exception as exc:
            print(f"Replication warning: {exc}")
        stop.wait(interval)


class BackgroundReplicator:
    def __init__(self, cloud_url: str = DEFAULT_CLOUD_URL, local_url: str = DEFAULT_LOCAL_URL, interval: int = 10):
        self.c_engine, self.l_engine = get_engines(cloud_url, local_url)
        self._stop = threading.Event()
        self._thread = threading.Thread(target=_push_on_change, args=(self.c_engine, self.l_engine, interval, self._stop),
                                        daemon=True, name="cloud-sql-sync")
        self.interval = interval

    def start(self):
        self._thread.start()
        print(f"🔄 Cloud SQL replication active (every {self.interval}s)")

    def stop(self):
        self._stop.set()


def start_background_replicator(cloud_url: str = DEFAULT_CLOUD_URL, local_url: str = DEFAULT_LOCAL_URL, interval: int = 10):
    replicator = BackgroundReplicator(cloud_url, local_url, interval=interval)
    replicator.start()
    return replicator


def main():
    parser = argparse.ArgumentParser(description="Kosh database sync")
    parser.add_argument("action", choices=["pull", "push", "status", "watch"])
    parser.add_argument("--interval", type=int, default=5, help="watch interval in seconds")
    args = parser.parse_args()
    c_engine, l_engine = get_engines()
    if args.action == "pull":
        pull_from_cloud(c_engine, l_engine)
    elif args.action == "push":
        push_to_cloud(c_engine, l_engine)
    elif args.action == "status":
        print_status(c_engine, l_engine)
    else:
        print(f"Watching the local database; pushing on change every {args.interval}s (Ctrl+C to stop)")
        try:
            _push_on_change(c_engine, l_engine, args.interval, threading.Event())
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
