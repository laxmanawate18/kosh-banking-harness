#!/usr/bin/env python3
"""Sentinel Database Synchronization & Replication Utility.

Synchronizes data bidirectionally between Local Database (fast 1ms local dev)
and Cloud SQL PostgreSQL (centralized cloud instance).

Usage:
    python scripts/sync_db.py pull     # Pull all tables from Cloud SQL to Local DB
    python scripts/sync_db.py push     # Push local database changes up to Cloud SQL
    python scripts/sync_db.py status   # Show sync status and record count comparison
    python scripts/sync_db.py watch    # Continuously push local changes in background
"""

import argparse
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List

from dotenv import load_dotenv

# Ensure repo root is in python path
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))
load_dotenv(ROOT_DIR / ".env")

from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from persistence import (
    Base,
    BankingStateRecord,
    AuditEventRecord,
    UserRecord,
    AuthSessionRecord,
    ConsentRecord,
    ConversationRecord,
    ServiceRequestRecord,
    ApprovalActionRecord,
    DocumentRecord,
    ModelRegistryRecord,
    BankingWorkflowRecord,
    CrossSellLeadRecord,
    NotificationRecord,
    OfferEventRecord,
    EkycSessionRecord,
    BankDocumentRecord,
)
import banking_store

DEFAULT_CLOUD_URL = os.getenv(
    "CLOUD_SQL_DATABASE_URL",
    "",
)
DEFAULT_LOCAL_URL = os.getenv(
    "LOCAL_DATABASE_URL",
    f"sqlite+pysqlite:///{ROOT_DIR / 'data' / 'sentinel_local.sqlite3'}",
)

MODELS = [
    UserRecord,
    BankingStateRecord,
    ConsentRecord,
    AuthSessionRecord,
    ConversationRecord,
    ServiceRequestRecord,
    ApprovalActionRecord,
    CrossSellLeadRecord,
    BankingWorkflowRecord,
    DocumentRecord,
    ModelRegistryRecord,
    AuditEventRecord,
    NotificationRecord,
    OfferEventRecord,
    EkycSessionRecord,
    BankDocumentRecord,
    *[spec.model for spec in banking_store.SPECS.values()],
]
STATE_MODELS = {BankDocumentRecord, *(spec.model for spec in banking_store.SPECS.values())}


def get_engines(cloud_url: str = DEFAULT_CLOUD_URL, local_url: str = DEFAULT_LOCAL_URL):
    if not cloud_url:
        raise RuntimeError("CLOUD_SQL_DATABASE_URL must be provided through environment or secret storage")
    os.makedirs(ROOT_DIR / "data", exist_ok=True)
    c_engine = create_engine(cloud_url)
    l_engine = create_engine(local_url)
    Base.metadata.create_all(l_engine)
    return c_engine, l_engine


def pull_from_cloud(c_engine, l_engine):
    """Pull all tables and records from Cloud SQL down to the local database."""
    print("📥 Pulling database from Cloud SQL into Local Database...")
    start_time = time.time()
    total_records = 0

    with c_engine.connect() as c_conn, l_engine.begin() as l_conn:
        for model in MODELS:
            table = model.__table__
            table_name = table.name
            try:
                rows = c_conn.execute(select(table)).fetchall()
            except Exception as e:
                print(f"  ⚠️ Could not read {table_name} from Cloud SQL: {e}")
                continue

            if not rows:
                continue

            # Clear or replace in local table
            pk_cols = [c.name for c in table.primary_key.columns]
            for row in rows:
                data = row._asdict()
                if "sqlite" in str(l_engine.url):
                    stmt = sqlite_insert(table).values(data)
                    update_dict = {k: v for k, v in data.items() if k not in pk_cols}
                    if update_dict and pk_cols:
                        stmt = stmt.on_conflict_do_update(index_elements=pk_cols, set_=update_dict)
                    else:
                        stmt = stmt.on_conflict_do_nothing()
                    l_conn.execute(stmt)
                else:
                    stmt = pg_insert(table).values(data)
                    update_dict = {k: v for k, v in data.items() if k not in pk_cols}
                    if update_dict and pk_cols:
                        stmt = stmt.on_conflict_do_update(index_elements=pk_cols, set_=update_dict)
                    else:
                        stmt = stmt.on_conflict_do_nothing()
                    l_conn.execute(stmt)

            print(f"  ✓ {table_name}: {len(rows)} records synced")
            total_records += len(rows)

    elapsed = time.time() - start_time
    print(f"✅ Pull complete: {total_records} records synced in {elapsed:.2f}s.\n")


def push_to_cloud(c_engine, l_engine, batch_size: int = 200):
    """Push local records and changes up to Cloud SQL in fast batched queries."""
    print("📤 Pushing local changes to Cloud SQL...")
    start_time = time.time()
    total_pushed = 0

    with l_engine.connect() as l_conn, c_engine.begin() as c_conn:
        for model in MODELS:
            table = model.__table__
            table_name = table.name
            try:
                rows = l_conn.execute(select(table)).fetchall()
            except Exception as e:
                print(f"  ⚠️ Could not read local {table_name}: {e}")
                continue

            if model in STATE_MODELS:  # banking state mirrors exactly, deletions included (the old JSON row did too)
                c_conn.execute(table.delete())
            if not rows:
                continue

            pk_cols = [c.name for c in table.primary_key.columns]
            dict_rows = [r._asdict() for r in rows]

            # Push in batches
            for i in range(0, len(dict_rows), batch_size):
                chunk = dict_rows[i:i + batch_size]
                stmt = pg_insert(table).values(chunk)
                update_dict = {c.name: stmt.excluded[c.name] for c in table.columns if c.name not in pk_cols}
                if update_dict and pk_cols:
                    stmt = stmt.on_conflict_do_update(index_elements=pk_cols, set_=update_dict)
                else:
                    stmt = stmt.on_conflict_do_nothing()
                c_conn.execute(stmt)

            print(f"  ✓ {table_name}: {len(dict_rows)} records upserted")
            total_pushed += len(dict_rows)

    elapsed = time.time() - start_time
    print(f"✅ Push complete: {total_pushed} records synced to Cloud SQL in {elapsed:.2f}s.\n")


def print_status(c_engine, l_engine):
    """Compare record counts between Local DB and Cloud SQL."""
    print("\n📊 Database Comparison (Local vs Cloud SQL):")
    print(f"{'Table':<25} | {'Local Count':<12} | {'Cloud Count':<12} | {'Status'}")
    print("-" * 65)

    with l_engine.connect() as l_conn, c_engine.connect() as c_conn:
        for model in MODELS:
            name = model.__tablename__
            try:
                l_cnt = l_conn.execute(text(f"SELECT count(*) FROM {name}")).scalar() or 0
            except Exception:
                l_cnt = "-"
            try:
                c_cnt = c_conn.execute(text(f"SELECT count(*) FROM {name}")).scalar() or 0
            except Exception:
                c_cnt = "-"

            if l_cnt == c_cnt:
                status = "🟢 In Sync"
            else:
                status = "🟡 Differs"
            print(f"{name:<25} | {str(l_cnt):<12} | {str(c_cnt):<12} | {status}")
    print("-" * 65 + "\n")


def watch_and_replicate(c_engine, l_engine, interval: int = 5):
    """Continuously push local changes up to Cloud SQL."""
    print(f"👀 Watching local database and replicating to Cloud SQL every {interval}s (Ctrl+C to stop)...")
    last_version = None

    while True:
        try:
            with l_engine.connect() as l_conn:
                row = l_conn.execute(select(BankingStateRecord.version, BankingStateRecord.updated_at).where(BankingStateRecord.id == 1)).fetchone()
                current_version = row[0] if row else 0

            if last_version is None:
                last_version = current_version
                print(f"Initial banking state version: {current_version}")
            elif current_version != last_version:
                print(f"\n⚡ Detected local state change (version {last_version} -> {current_version}). Replicating...")
                push_to_cloud(c_engine, l_engine)
                last_version = current_version

            time.sleep(interval)
        except KeyboardInterrupt:
            print("\nStopped watcher.")
            break
        except Exception as exc:
            print(f"Replication check error: {exc}")
            time.sleep(interval)


import threading


class BackgroundReplicator:
    def __init__(self, cloud_url: str = DEFAULT_CLOUD_URL, local_url: str = DEFAULT_LOCAL_URL, interval: int = 10):
        self.cloud_url = cloud_url
        self.local_url = local_url
        self.interval = interval
        self._stop_event = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True, name="cloud-sql-sync")
        self.c_engine, self.l_engine = get_engines(cloud_url, local_url)

    def start(self):
        self._thread.start()
        print(f"🔄 [REPLICATOR] Cloud SQL background replication active (sync interval: {self.interval}s)")

    def stop(self):
        self._stop_event.set()

    def _run(self):
        last_version = None
        while not self._stop_event.is_set():
            try:
                with self.l_engine.connect() as l_conn:
                    row = l_conn.execute(select(BankingStateRecord.version).where(BankingStateRecord.id == 1)).fetchone()
                    current_version = row[0] if row else 0

                if last_version is None:
                    last_version = current_version
                elif current_version != last_version:
                    print(f"⚡ [REPLICATOR] State updated (v{last_version} -> v{current_version}). Replicating to Cloud SQL...")
                    push_to_cloud(self.c_engine, self.l_engine)
                    last_version = current_version
            except Exception as exc:
                print(f"[REPLICATOR] Sync warning: {exc}")
            self._stop_event.wait(self.interval)


def start_background_replicator(cloud_url: str = DEFAULT_CLOUD_URL, local_url: str = DEFAULT_LOCAL_URL, interval: int = 10):
    rep = BackgroundReplicator(cloud_url, local_url, interval=interval)
    rep.start()
    return rep


def main():
    parser = argparse.ArgumentParser(description="Sentinel DB Sync")
    parser.add_argument("action", choices=["pull", "push", "status", "watch"], help="Sync action")
    parser.add_argument("--interval", type=int, default=5, help="Watch interval in seconds")
    args = parser.parse_args()

    c_engine, l_engine = get_engines()

    if args.action == "pull":
        pull_from_cloud(c_engine, l_engine)
    elif args.action == "push":
        push_to_cloud(c_engine, l_engine)
    elif args.action == "status":
        print_status(c_engine, l_engine)
    elif args.action == "watch":
        watch_and_replicate(c_engine, l_engine, interval=args.interval)


if __name__ == "__main__":
    main()
