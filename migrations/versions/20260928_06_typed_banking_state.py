"""Move banking state off the single JSON record into typed bank_* tables; add notification, offer and e-KYC tables.

Revision ID: 20260928_06
Revises: 20260925_05

Data: the legacy banking_state payload is split into the typed tables in the same transaction and the row is kept
as the lock/version row. Downgrade folds the tables back into the JSON record.
"""
from alembic import op
from sqlalchemy.orm import Session

import banking_store  # no side effects; banking_db would open the app database on import
from banking_store import TYPED_MARKER
from persistence import (BankingStateRecord, BankDocumentRecord, CrossSellLeadRecord, EkycSessionRecord,
                         NotificationRecord, OfferEventRecord)

revision = "20260928_06"
down_revision = "20260925_05"
branch_labels = None
depends_on = None

TABLES = [spec.model.__table__ for spec in banking_store.SPECS.values()] + [
    BankDocumentRecord.__table__, CrossSellLeadRecord.__table__, NotificationRecord.__table__,
    OfferEventRecord.__table__, EkycSessionRecord.__table__]


def upgrade():
    bind = op.get_bind()
    for table in TABLES:
        table.create(bind, checkfirst=True)
    session = Session(bind=bind)
    row = session.get(BankingStateRecord, 1)
    if row is not None and row.payload.get("storage") != "typed":
        banking_store.replace(session, row.payload)
        row.payload, row.version = dict(TYPED_MARKER), row.version + 1
    session.flush()


def downgrade():
    bind = op.get_bind()
    session = Session(bind=bind)
    row = session.get(BankingStateRecord, 1)
    if row is not None and row.payload.get("storage") == "typed":
        row.payload, row.version = banking_store.load(session), row.version + 1
    session.flush()
    for table in reversed(TABLES[: len(banking_store.SPECS) + 1]):
        table.drop(bind, checkfirst=True)
