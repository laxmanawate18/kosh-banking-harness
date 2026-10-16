"""Add newer core applications, documents, AI governance and service request tables.

Revision ID: 20261017_08
Revises: 20260929_07
"""
from alembic import op

from persistence import (
    AccountApplicationRecord,
    ApplicationDocumentRecord,
    ModelRegistryRecord,
    OntologyApprovalRecord,
    ServiceRequestRecord,
    ApprovalActionRecord,
    CustomerDeletionRecord,
)

revision = "20261017_08"
down_revision = "20260929_07"
branch_labels = None
depends_on = None

TABLES = [
    AccountApplicationRecord.__table__,
    ApplicationDocumentRecord.__table__,
    ModelRegistryRecord.__table__,
    OntologyApprovalRecord.__table__,
    ServiceRequestRecord.__table__,
    ApprovalActionRecord.__table__,
    CustomerDeletionRecord.__table__,
]


def upgrade() -> None:
    bind = op.get_bind()
    for table in TABLES:
        table.create(bind, checkfirst=True)


def downgrade() -> None:
    bind = op.get_bind()
    for table in reversed(TABLES):
        table.drop(bind, checkfirst=True)
