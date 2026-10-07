#!/usr/bin/env python3
"""Copy an evaluation run from the local registry to production for the same prompt version.

    venv/bin/python scripts/promote_evaluation.py --version 183a1c4d8f0f            # dry run: shows what would be copied
    venv/bin/python scripts/promote_evaluation.py --version 183a1c4d8f0f --apply    # writes to production

The prompt version is a hash of everything that shapes Mitra's and the copilot's replies, so a run on that version is valid
for the same version anywhere. Refuses unless: this checkout produces that version, the local run passes the release
gate, and production has registered that version (i.e. the same code is deployed). It never approves: the AI owner
approves in the production Admin Panel (Approvals) after reviewing the copied run.

Target database: CLOUD_SQL_DATABASE_URL (from .env, as scripts/sync_db.py uses) or --target.
"""

from __future__ import annotations

import argparse
import copy
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")
os.environ["ENABLE_CLOUD_SQL_SYNC"] = "false"

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from persistence import ModelRegistryRecord  # noqa: E402


def latest_run(url: str, record_id: str):
    with sessionmaker(bind=create_engine(url))() as session:
        row = session.get(ModelRegistryRecord, record_id)
        return copy.deepcopy(row.evaluation_summary) if row else None


def promote(source_url: str, target_url: str, version: str, apply: bool) -> int:
    from backend.mitra_ops import prompt_version, release_gate
    record_id = f"PROMPT-{version}"
    if prompt_version() != version:
        print(f"Refused: this checkout is prompt version {prompt_version()}, not {version}.")
        return 1
    source = latest_run(source_url, record_id)
    runs = (source or {}).get("evaluations") or []
    if not runs:
        print(f"Refused: no local evaluation recorded on {record_id}.")
        return 1
    run = runs[-1]
    failures = release_gate(run)
    if failures:
        print(f"Refused: the latest local run fails the release gate: {'; '.join(failures)}")
        return 1
    target_engine = create_engine(target_url)
    with sessionmaker(bind=target_engine)() as session:
        row = session.get(ModelRegistryRecord, record_id)
        if row is None:
            print(f"Refused: production has not registered {record_id}. Deploy this exact code first; it registers at start-up.")
            return 1
        summary = dict(row.evaluation_summary or {})
        if any(e.get("at") == run["at"] for e in summary.get("evaluations") or []):
            print(f"Already copied: the run from {run['at']} is on production {record_id}.")
            return 0
        promoted = {**run, "promoted_from": "local evaluation run", "promoted_note": "Same prompt version hash; copied, not re-run"}
        print(f"Run {run['at']}: {run['passed']}/{run['total']} ({run['pass_rate']}%), release gate passed.")
        print(f"Target {record_id}: active={row.active}, approval={summary.get('approval') or 'none'}")
        if not apply:
            print("Dry run. Re-run with --apply to copy it; then approve it in the production Admin Panel (Approvals).")
            return 0
        summary["evaluations"] = (summary.get("evaluations") or [])[-9:] + [promoted]
        row.evaluation_summary = summary
        session.commit()
    print(f"Copied. Approve {record_id} in the Admin Panel → Approvals (sign in as the admin).")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--version", required=True)
    parser.add_argument("--source", default=f"sqlite+pysqlite:///{ROOT / '.local' / 'e2e.sqlite3'}", help="local app database")
    parser.add_argument("--target", default=os.getenv("CLOUD_SQL_DATABASE_URL", ""), help="production database URL")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if not args.target:
        print("Set CLOUD_SQL_DATABASE_URL or pass --target.")
        return 2
    return promote(args.source, args.target, args.version, args.apply)


if __name__ == "__main__":
    raise SystemExit(main())
