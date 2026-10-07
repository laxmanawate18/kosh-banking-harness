"""Root fixtures shared by every test module."""
import sys

import pytest


@pytest.fixture(autouse=True)
def _reset_chat_rate_limit():
    # Looked up lazily: importing the app here would create the database before tests choose theirs.
    banking_db = sys.modules.get("banking_db")
    if banking_db:
        from sqlalchemy import delete
        from persistence import RateLimitRecord
        with banking_db.db.runtime.sessions.begin() as session:
            session.execute(delete(RateLimitRecord))
    yield


class _OfflineModel:
    """Stands in for the process classifier's model client: tests never call a live model."""

    def __getattr__(self, name):
        raise ConnectionError("tests never call a live model")


@pytest.fixture(autouse=True)
def _offline_and_no_local_backup(monkeypatch):
    from backend import mitra_ops, ontology
    monkeypatch.setattr(ontology, "_CLIENT", _OfflineModel())
    # Tests never inherit the backup model from a local .env; tests about the backup set it themselves.
    monkeypatch.setattr("backend.settings.FALLBACK_MODEL", None)
    monkeypatch.setattr("backend.settings.FORCE_BACKUP", False)
    monkeypatch.setattr(mitra_ops, "_primary_rest_until", [float("-inf")])
    monkeypatch.setattr(mitra_ops, "_backup_clearance", {"at": float("-inf"), "cleared": False})
    yield
