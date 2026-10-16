"""Add isolated OAuth identity mapping and BFF grant storage.

Revision ID: 20260925_05
Revises: 20260912_04
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260925_05"
down_revision = "20260912_04"
branch_labels = None
depends_on = None


JSON_DOCUMENT = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c["name"] for c in insp.get_columns("app_users")}
    if "auth_subject" not in cols:
        op.add_column("app_users", sa.Column("auth_subject", sa.String(160), nullable=True))
        op.create_index("ix_app_users_auth_subject", "app_users", ["auth_subject"], unique=True)

    if not insp.has_table("oauth_login_states"):
        op.create_table(
            "oauth_login_states",
            sa.Column("id", sa.String(80), primary_key=True),
            sa.Column("state_hash", sa.String(64), nullable=False),
            sa.Column("encrypted_verifier", sa.Text(), nullable=False),
            sa.Column("nonce", sa.String(120), nullable=False),
            sa.Column("client_id", sa.String(160), nullable=False),
            sa.Column("redirect_uri", sa.String(500), nullable=False),
            sa.Column("return_to", sa.String(500), nullable=False),
            sa.Column("chat_session_id", sa.String(80), nullable=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_oauth_login_states_state_hash", "oauth_login_states", ["state_hash"], unique=True)
        op.create_index("ix_oauth_login_states_chat_session_id", "oauth_login_states", ["chat_session_id"])
        op.create_index("ix_oauth_login_states_expires_at", "oauth_login_states", ["expires_at"])

    if not insp.has_table("oauth_grants"):
        op.create_table(
            "oauth_grants",
            sa.Column("id", sa.String(80), primary_key=True),
            sa.Column("auth_session_id", sa.String(80), sa.ForeignKey("auth_sessions.id"), nullable=False),
            sa.Column("user_id", sa.String(80), sa.ForeignKey("app_users.id"), nullable=False),
            sa.Column("auth_subject", sa.String(160), nullable=False),
            sa.Column("provider_session_id", sa.String(255), nullable=False),
            sa.Column("client_id", sa.String(160), nullable=False),
            sa.Column("encrypted_access_token", sa.Text(), nullable=False),
            sa.Column("encrypted_refresh_token", sa.Text(), nullable=True),
            sa.Column("scopes", JSON_DOCUMENT, nullable=False),
            sa.Column("access_expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("refresh_expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
        for column in ("auth_session_id", "user_id", "auth_subject", "provider_session_id", "client_id", "access_expires_at"):
            op.create_index(f"ix_oauth_grants_{column}", "oauth_grants", [column])

    if not insp.has_table("websocket_tickets"):
        op.create_table(
            "websocket_tickets",
            sa.Column("id", sa.String(80), primary_key=True),
            sa.Column("ticket_hash", sa.String(64), nullable=False),
            sa.Column("user_id", sa.String(80), sa.ForeignKey("app_users.id"), nullable=False),
            sa.Column("chat_session_id", sa.String(80), nullable=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_websocket_tickets_ticket_hash", "websocket_tickets", ["ticket_hash"], unique=True)
        op.create_index("ix_websocket_tickets_user_id", "websocket_tickets", ["user_id"])
        op.create_index("ix_websocket_tickets_chat_session_id", "websocket_tickets", ["chat_session_id"])
        op.create_index("ix_websocket_tickets_expires_at", "websocket_tickets", ["expires_at"])


def downgrade() -> None:
    op.drop_table("websocket_tickets")
    op.drop_table("oauth_grants")
    op.drop_table("oauth_login_states")
    op.drop_index("ix_app_users_auth_subject", table_name="app_users")
    op.drop_column("app_users", "auth_subject")
