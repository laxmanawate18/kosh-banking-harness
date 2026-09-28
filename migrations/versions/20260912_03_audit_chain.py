"""Add tamper-evident audit chain fields.

Revision ID: 20260912_03
Revises: 20260912_02
"""

from alembic import op
import sqlalchemy as sa

revision = "20260912_03"
down_revision = "20260912_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("audit_events", sa.Column("previous_hash", sa.String(64), nullable=False, server_default="0" * 64))
    op.add_column("audit_events", sa.Column("integrity_hash", sa.String(64), nullable=True))
    op.execute("UPDATE audit_events SET integrity_hash = md5(event_id) || md5(event_id) WHERE integrity_hash IS NULL")
    op.alter_column("audit_events", "integrity_hash", nullable=False)
    op.create_unique_constraint("uq_audit_integrity_hash", "audit_events", ["integrity_hash"])


def downgrade() -> None:
    op.drop_constraint("uq_audit_integrity_hash", "audit_events", type_="unique")
    op.drop_column("audit_events", "integrity_hash")
    op.drop_column("audit_events", "previous_hash")
