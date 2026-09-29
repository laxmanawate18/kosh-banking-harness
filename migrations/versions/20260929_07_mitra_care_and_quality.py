"""Mitra customer care cases, turn log and reply feedback.

Revision ID: 20260929_07
Revises: 20260928_06
"""
from alembic import op

from persistence import CareCaseRecord, ChatFeedbackRecord, MitraTurnRecord

revision = "20260929_07"
down_revision = "20260928_06"
branch_labels = None
depends_on = None

TABLES = [CareCaseRecord.__table__, MitraTurnRecord.__table__, ChatFeedbackRecord.__table__]


def upgrade():
    for table in TABLES:
        table.create(op.get_bind(), checkfirst=True)


def downgrade():
    for table in reversed(TABLES):
        table.drop(op.get_bind(), checkfirst=True)
