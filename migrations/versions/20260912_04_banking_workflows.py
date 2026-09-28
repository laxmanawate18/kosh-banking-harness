"""Persist guided banking workflow drafts and encrypted evidence.

Revision ID: 20260912_04
Revises: 20260912_03
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260912_04"
down_revision = "20260912_03"
branch_labels = None
depends_on = None


def upgrade():
    if sa.inspect(op.get_bind()).has_table("banking_workflows"):
        return
    op.create_table("banking_workflows",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("customer_id", sa.String(80), nullable=False),
        sa.Column("user_id", sa.String(80), nullable=False),
        sa.Column("skill_id", sa.String(80), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("payload", sa.JSON().with_variant(postgresql.JSONB(), "postgresql"), nullable=False),
        sa.Column("request_id", sa.String(80)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_banking_workflows_customer_id", "banking_workflows", ["customer_id"])
    op.create_index("ix_banking_workflows_user_id", "banking_workflows", ["user_id"])


def downgrade():
    op.drop_table("banking_workflows")
