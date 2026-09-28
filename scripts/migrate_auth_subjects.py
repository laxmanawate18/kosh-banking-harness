#!/usr/bin/env python3
"""One-time identity-boundary migration from Better Auth to Sentinel.

This is intentionally the only utility that opens both databases. It copies
Better Auth's immutable user id into ``app_users.auth_subject`` by matching the
administrator-controlled ``sentinelUserId`` field. It never copies phone
numbers, password hashes, sessions, or OAuth tokens.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import sys

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text


ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))
load_dotenv(ROOT_DIR / ".env")

def sqlalchemy_url(value: str) -> str:
    if value.startswith("postgresql://"):
        return value.replace("postgresql://", "postgresql+psycopg://", 1)
    return value


def migrate(*, apply: bool) -> tuple[int, int]:
    auth_url = os.getenv("AUTH_DATABASE_URL", "")
    banking_url = os.getenv("SENTINEL_DATABASE_URL", "")
    if not auth_url or not banking_url:
        raise RuntimeError("AUTH_DATABASE_URL and SENTINEL_DATABASE_URL are both required")

    auth_engine = create_engine(sqlalchemy_url(auth_url), pool_pre_ping=True)
    banking_engine = create_engine(sqlalchemy_url(banking_url), pool_pre_ping=True)
    with auth_engine.connect() as auth_connection:
        mappings = auth_connection.execute(text(
            'SELECT "id", "sentinelUserId" FROM "user" '
            'WHERE "sentinelUserId" IS NOT NULL ORDER BY "sentinelUserId"'
        )).mappings().all()

    linked = 0
    skipped = 0
    with banking_engine.begin() as connection:
        columns = {column["name"] for column in inspect(connection).get_columns("app_users")}
        has_subject_column = "auth_subject" in columns
        if apply and not has_subject_column:
            connection.execute(text("ALTER TABLE app_users ADD COLUMN auth_subject VARCHAR(160)"))
            connection.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_app_users_auth_subject ON app_users(auth_subject)"
            ))
            has_subject_column = True
        for mapping in mappings:
            subject_expression = "auth_subject" if has_subject_column else "NULL AS auth_subject"
            user = connection.execute(
                text(f"SELECT id, {subject_expression} FROM app_users WHERE id = :user_id"),
                {"user_id": mapping["sentinelUserId"]},
            ).mappings().one_or_none()
            if user is None:
                skipped += 1
                continue
            current = user.get("auth_subject")
            if current and current != mapping["id"]:
                raise RuntimeError(
                    f"Refusing to replace an existing subject for {mapping['sentinelUserId']}"
                )
            if not current:
                linked += 1
                if apply:
                    connection.execute(text(
                        "UPDATE app_users SET auth_subject = :subject WHERE id = :user_id"
                    ), {"subject": mapping["id"], "user_id": mapping["sentinelUserId"]})
    auth_engine.dispose()
    banking_engine.dispose()
    return linked, skipped


def main() -> None:
    parser = argparse.ArgumentParser(description="Map Better Auth subjects to Sentinel users")
    parser.add_argument("--apply", action="store_true", help="Commit the migration (default is dry-run)")
    args = parser.parse_args()
    linked, skipped = migrate(apply=args.apply)
    mode = "Applied" if args.apply else "Dry run"
    print(f"{mode}: {linked} subject link(s); {skipped} unmatched auth user(s).")


if __name__ == "__main__":
    main()
