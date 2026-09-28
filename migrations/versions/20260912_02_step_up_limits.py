"""Add step-up attempt controls.

Revision ID: 20260912_02
Revises: 20260912_01
"""

from alembic import op
import sqlalchemy as sa

revision = "20260912_02"
down_revision = "20260912_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("auth_sessions", sa.Column("step_up_failures", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("auth_sessions", sa.Column("step_up_locked_until", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("auth_sessions", "step_up_locked_until")
    op.drop_column("auth_sessions", "step_up_failures")
