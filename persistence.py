"""SQLAlchemy persistence primitives for Sentinel's PostgreSQL runtime."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Generator

from dotenv import load_dotenv
if os.getenv("SKIP_DOTENV") != "1":
    load_dotenv()


from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, JSON, String, Text, create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker


DEFAULT_DATABASE_URL = "postgresql+psycopg://sentinel:sentinel_dev@127.0.0.1:5433/sentinel"
JSON_DOCUMENT = JSON().with_variant(JSONB, "postgresql")


def utc_dt() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class BankingStateRecord(Base):
    __tablename__ = "banking_state"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON_DOCUMENT, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_dt)


class AuditEventRecord(Base):
    __tablename__ = "audit_events"
    sequence: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    session_id: Mapped[str | None] = mapped_column(String(80), index=True)
    customer_id_token: Mapped[str | None] = mapped_column(String(80), index=True)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    service_id: Mapped[str | None] = mapped_column(String(32), index=True)
    actor: Mapped[str] = mapped_column(String(20), nullable=False, default="system")
    model_version: Mapped[str | None] = mapped_column(String(80))
    prompt_version: Mapped[str | None] = mapped_column(String(40))
    policy_version: Mapped[str | None] = mapped_column(String(40))
    consent_id: Mapped[str | None] = mapped_column(String(80))
    approval_request_id: Mapped[str | None] = mapped_column(String(80))
    approver_id: Mapped[str | None] = mapped_column(String(80))
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="INFO")
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    details: Mapped[dict[str, Any]] = mapped_column(JSON_DOCUMENT, nullable=False, default=dict)
    previous_hash: Mapped[str] = mapped_column(String(64), nullable=False, default="0" * 64)
    integrity_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_dt, index=True)


class UserRecord(Base):
    __tablename__ = "app_users"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    username: Mapped[str] = mapped_column(String(120), unique=True, nullable=False, index=True)
    phone_number: Mapped[str | None] = mapped_column(String(30), unique=True, nullable=True, index=True)
    gcp_uid: Mapped[str | None] = mapped_column(String(128), unique=True, nullable=True, index=True)
    auth_subject: Mapped[str | None] = mapped_column(String(160), unique=True, nullable=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    customer_id: Mapped[str | None] = mapped_column(String(80), index=True)
    display_name: Mapped[str] = mapped_column(String(160), nullable=False)
    role: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_dt)


class AuthSessionRecord(Base):
    __tablename__ = "auth_sessions"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    csrf_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("app_users.id"), nullable=False, index=True)
    assurance_level: Mapped[str] = mapped_column(String(20), nullable=False, default="L2")
    step_up_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    step_up_failures: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    step_up_locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_dt)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ip_hash: Mapped[str | None] = mapped_column(String(64))
    user_agent_hash: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_dt)
    user: Mapped[UserRecord] = relationship()


class OAuthLoginStateRecord(Base):
    """Short-lived, one-use state and PKCE material for a BFF authorization flow."""

    __tablename__ = "oauth_login_states"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    state_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    encrypted_verifier: Mapped[str] = mapped_column(Text, nullable=False)
    nonce: Mapped[str] = mapped_column(String(120), nullable=False)
    client_id: Mapped[str] = mapped_column(String(160), nullable=False)
    redirect_uri: Mapped[str] = mapped_column(String(500), nullable=False)
    return_to: Mapped[str] = mapped_column(String(500), nullable=False, default="/")
    chat_session_id: Mapped[str | None] = mapped_column(String(80), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_dt)


class OAuthGrantRecord(Base):
    """Encrypted delegated grant held by Sentinel; tokens never reach the browser."""

    __tablename__ = "oauth_grants"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    auth_session_id: Mapped[str] = mapped_column(ForeignKey("auth_sessions.id"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("app_users.id"), nullable=False, index=True)
    auth_subject: Mapped[str] = mapped_column(String(160), nullable=False, index=True)
    provider_session_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    client_id: Mapped[str] = mapped_column(String(160), nullable=False, index=True)
    encrypted_access_token: Mapped[str] = mapped_column(Text, nullable=False)
    encrypted_refresh_token: Mapped[str | None] = mapped_column(Text)
    scopes: Mapped[list[str]] = mapped_column(JSON_DOCUMENT, nullable=False, default=list)
    access_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    refresh_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_dt)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_dt)


class WebSocketTicketRecord(Base):
    """Single-use, short-lived handoff credential for OAuth-upgraded chat sockets."""

    __tablename__ = "websocket_tickets"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    ticket_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("app_users.id"), nullable=False, index=True)
    chat_session_id: Mapped[str | None] = mapped_column(String(80), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_dt)


class ConsentRecord(Base):
    __tablename__ = "consents"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    customer_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    purpose: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    scope: Mapped[list[str]] = mapped_column(JSON_DOCUMENT, nullable=False)
    terms_version: Mapped[str] = mapped_column(String(40), nullable=False)
    capture_method: Mapped[str] = mapped_column(String(40), nullable=False)
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_dt)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (Index("ix_active_consent", "customer_id", "purpose", "revoked_at"),)


class ConversationRecord(Base):
    __tablename__ = "conversation_sessions"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("app_users.id"), index=True)
    customer_id: Mapped[str | None] = mapped_column(String(80), index=True)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    product: Mapped[str] = mapped_column(String(40), nullable=False, default="sentinel-v2")
    messages: Mapped[list[dict[str, Any]]] = mapped_column(JSON_DOCUMENT, nullable=False, default=list)
    traces: Mapped[list[dict[str, Any]]] = mapped_column(JSON_DOCUMENT, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_dt)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_dt, index=True)


class ServiceRequestRecord(Base):
    __tablename__ = "service_requests"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    customer_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    session_id: Mapped[str | None] = mapped_column(String(80), index=True)
    service_id: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    auth_level: Mapped[str] = mapped_column(String(20), nullable=False)
    collected_data: Mapped[dict[str, Any]] = mapped_column(JSON_DOCUMENT, nullable=False, default=dict)
    findings: Mapped[list[dict[str, Any]]] = mapped_column(JSON_DOCUMENT, nullable=False, default=list)
    discrepancy_flags: Mapped[list[dict[str, Any]]] = mapped_column(JSON_DOCUMENT, nullable=False, default=list)
    confidence_scores: Mapped[dict[str, Any]] = mapped_column(JSON_DOCUMENT, nullable=False, default=dict)
    disclosure_ack_id: Mapped[str | None] = mapped_column(String(80))
    approver_id: Mapped[str | None] = mapped_column(String(80))
    resolution_reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_dt)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_dt, index=True)


class ApprovalActionRecord(Base):
    __tablename__ = "approval_actions"
    sequence: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    request_id: Mapped[str] = mapped_column(ForeignKey("service_requests.id"), nullable=False, index=True)
    officer_user_id: Mapped[str] = mapped_column(ForeignKey("app_users.id"), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    override_justification: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_dt)


class DocumentRecord(Base):
    __tablename__ = "documents"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    request_id: Mapped[str] = mapped_column(ForeignKey("service_requests.id"), nullable=False, index=True)
    document_type: Mapped[str] = mapped_column(String(80), nullable=False)
    original_name: Mapped[str] = mapped_column(String(240), nullable=False)
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(300), nullable=False)
    malware_status: Mapped[str] = mapped_column(String(30), nullable=False)
    extracted_fields: Mapped[dict[str, Any]] = mapped_column(JSON_DOCUMENT, nullable=False, default=dict)
    confidence_scores: Mapped[dict[str, Any]] = mapped_column(JSON_DOCUMENT, nullable=False, default=dict)
    tamper_flags: Mapped[list[str]] = mapped_column(JSON_DOCUMENT, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_dt)


class ModelRegistryRecord(Base):
    __tablename__ = "model_registry"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    model_name: Mapped[str] = mapped_column(String(120), nullable=False)
    version: Mapped[str] = mapped_column(String(80), nullable=False)
    approved_use_cases: Mapped[list[str]] = mapped_column(JSON_DOCUMENT, nullable=False)
    evaluation_summary: Mapped[dict[str, Any]] = mapped_column(JSON_DOCUMENT, nullable=False, default=dict)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_dt)


class BankingWorkflowRecord(Base):
    __tablename__ = "banking_workflows"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    customer_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    skill_id: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="DRAFT")
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON_DOCUMENT, nullable=False, default=dict)
    request_id: Mapped[str | None] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_dt)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_dt)


class CrossSellLeadRecord(Base):
    __tablename__ = "cross_sell_leads"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    customer_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    session_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    category: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    sub_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    amount_requested_minor: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tenure_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    employment_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    monthly_income_minor: Mapped[int | None] = mapped_column(Integer, nullable=True)
    preferences: Mapped[dict[str, Any]] = mapped_column(JSON_DOCUMENT, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="DISCOVERY", index=True)
    recommended_product_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    special_offer_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    follow_up_pitch: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_dt)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_dt)


class NotificationRecord(Base):
    """Every customer SMS / WhatsApp message: what was sent, to whom, through which provider, and the outcome."""

    __tablename__ = "notification_outbox"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    event: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    channel: Mapped[str] = mapped_column(String(16), nullable=False)
    recipient: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    customer_id: Mapped[str | None] = mapped_column(String(80), index=True)
    reference: Mapped[str | None] = mapped_column(String(80), index=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    provider_ref: Mapped[str | None] = mapped_column(String(120))
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_dt, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_dt)


class OfferEventRecord(Base):
    """One step of a personalised offer's life: SHOWN, CLICKED, APPLIED or DISMISSED, on a channel."""

    __tablename__ = "offer_events"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    customer_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    product_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    channel: Mapped[str] = mapped_column(String(20), nullable=False)
    event: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    reason_code: Mapped[str | None] = mapped_column(String(60))
    reference: Mapped[str | None] = mapped_column(String(80), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_dt, index=True)


class EkycSessionRecord(Base):
    """One e-KYC / V-CIP attempt with the configured provider (or the labelled sandbox)."""

    __tablename__ = "ekyc_sessions"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    customer_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    provider_ref: Mapped[str | None] = mapped_column(String(120), index=True)
    redirect_url: Mapped[str] = mapped_column(Text, nullable=False)
    result: Mapped[dict[str, Any]] = mapped_column(JSON_DOCUMENT, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_dt)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_dt)


class DatabaseRuntime:
    def __init__(self, url: str | None = None) -> None:
        self.url = url or os.getenv("SENTINEL_DATABASE_URL") or DEFAULT_DATABASE_URL
        connect_args = {"check_same_thread": False} if self.url.startswith("sqlite") else {}
        self.engine = create_engine(self.url, pool_pre_ping=True, future=True, connect_args=connect_args)
        self.sessions = sessionmaker(bind=self.engine, expire_on_commit=False, class_=Session)

    def initialize(self) -> None:
        Base.metadata.create_all(self.engine)
        if self.url.startswith("sqlite"):
            # create_all does not add columns to an existing hackathon SQLite
            # replica, so keep the local database forward-readable.
            with self.engine.begin() as conn:
                columns = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(app_users)")}
                if "auth_subject" not in columns:
                    conn.exec_driver_sql("ALTER TABLE app_users ADD COLUMN auth_subject VARCHAR(160)")
                conn.exec_driver_sql(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_app_users_auth_subject ON app_users(auth_subject)"
                )
                grant_columns = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(oauth_grants)")}
                if grant_columns and "provider_session_id" not in grant_columns:
                    conn.exec_driver_sql("ALTER TABLE oauth_grants ADD COLUMN provider_session_id VARCHAR(255)")
                    conn.exec_driver_sql(
                        "UPDATE oauth_grants SET provider_session_id = '' WHERE provider_session_id IS NULL"
                    )
                if grant_columns:
                    conn.exec_driver_sql(
                        "CREATE INDEX IF NOT EXISTS ix_oauth_grants_provider_session_id ON oauth_grants(provider_session_id)"
                    )
        else:
            with self.engine.begin() as conn:
                try:
                    conn.exec_driver_sql("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(32);")
                    conn.exec_driver_sql("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS gcp_uid VARCHAR(128);")
                    conn.exec_driver_sql("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS auth_subject VARCHAR(160);")
                    conn.exec_driver_sql("ALTER TABLE app_users ALTER COLUMN password_hash DROP NOT NULL;")
                    conn.exec_driver_sql("CREATE UNIQUE INDEX IF NOT EXISTS ix_app_users_phone_number ON app_users(phone_number);")
                    conn.exec_driver_sql("CREATE UNIQUE INDEX IF NOT EXISTS ix_app_users_gcp_uid ON app_users(gcp_uid);")
                    conn.exec_driver_sql("CREATE UNIQUE INDEX IF NOT EXISTS ix_app_users_auth_subject ON app_users(auth_subject);")
                    conn.exec_driver_sql("ALTER TABLE oauth_grants ADD COLUMN IF NOT EXISTS provider_session_id VARCHAR(255);")
                    conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_oauth_grants_provider_session_id ON oauth_grants(provider_session_id);")
                except Exception:
                    pass

    def session(self) -> Generator[Session, None, None]:
        with self.sessions() as session:
            yield session
