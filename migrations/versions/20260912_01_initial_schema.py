"""Initial Sentinel persistence schema.

Revision ID: 20260912_01
Revises: none
"""

from alembic import op

from persistence import Base

revision = "20260912_01"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # SQLAlchemy remains the single source of truth for PostgreSQL JSONB variants,
    # indexes, and foreign keys; Alembic owns when that metadata is applied.
    Base.metadata.create_all(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind(), checkfirst=True)
