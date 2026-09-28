"""Bank-owned authentication, session, CSRF, consent, and assurance controls."""

from __future__ import annotations

import hashlib
import os
import re
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select

from persistence import AuthSessionRecord, ConsentRecord, DatabaseRuntime, OAuthGrantRecord, UserRecord, utc_dt


COOKIE_NAME = "sentinel_session"
TERMS_VERSION = "sentinel-terms-v1"
CONSENT_PURPOSE = "digital_banking"
CONSENT_SCOPE = ["accounts:read", "transactions:read", "payments:propose", "cards:protect", "service_requests:create"]
IDLE_TIMEOUT = timedelta(minutes=10)
ABSOLUTE_TIMEOUT = timedelta(hours=8)


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _aware(value: datetime | None) -> datetime | None:
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=timezone.utc)

DEMO_OTP = os.getenv("DEMO_OTP", "246810")


def normalize_phone(value: str) -> str:
    cleaned = re.sub(r"[^\d+]", "", value.strip())
    if cleaned.startswith("+"):
        return cleaned
    if len(cleaned) == 10:
        return f"+91{cleaned}"
    return f"+{cleaned}" if cleaned else ""


@dataclass(frozen=True)
class AuthContext:
    session_id: str
    user_id: str
    username: str
    display_name: str
    role: str
    customer_id: str | None
    assurance_level: str
    phone_number: str | None = None
    csrf_token: str | None = None
    auth_subject: str | None = None
    client_id: str | None = None
    scopes: tuple[str, ...] = ()
    auth_source: str = "oidc"

    def safe_dict(self) -> dict[str, Any]:
        return {
            "authenticated": True,
            "session_id": self.session_id,
            "user": {"id": self.user_id, "username": self.username, "display_name": self.display_name,
                     "role": self.role, "customer_id": self.customer_id, "phone_number": self.phone_number},
            "assurance_level": self.assurance_level,
            "csrf_token": self.csrf_token,
            "auth_source": self.auth_source,
            "client_id": self.client_id,
            "scopes": list(self.scopes),
        }


class AuthService:
    def __init__(self, runtime: DatabaseRuntime) -> None:
        self.runtime = runtime
        self.seed_demo_users()

    def seed_demo_users(self) -> None:
        demo_users = [
            ("USR-CUSTOMER-001", "aarav", "+919876543210", "Aarav Mehta", "CUSTOMER", "CUST-1001"),
            ("USR-CUSTOMER-002", "sudhir", "+919839774797", "Sudhir Jaiswal", "CUSTOMER", "CUST-1002"),
            ("USR-OFFICER-001", "officer.mumbai", None, "Neha Rao", "OFFICER", None),
        ]
        with self.runtime.sessions.begin() as session:
            for user_id, username, phone, display_name, role, customer_id in demo_users:
                user = session.get(UserRecord, user_id)
                if user is None:
                    session.add(UserRecord(id=user_id, username=username, phone_number=phone,
                                           password_hash=None,
                                           display_name=display_name, role=role, customer_id=customer_id, active=True))
                else:
                    user.password_hash = None
                    user.gcp_uid = None
                    if phone and user.phone_number != phone:
                        user.phone_number = phone
                    if customer_id and user.customer_id != customer_id:
                        user.customer_id = customer_id
                    if display_name and user.display_name != display_name:
                        user.display_name = display_name

    def _create_session(self, session: Any, user: UserRecord, *, ip: str, user_agent: str, assurance_level: str = "L2") -> tuple[AuthContext, str, str]:
        raw_token = secrets.token_urlsafe(32)
        csrf_token = secrets.token_urlsafe(24)
        now = utc_dt()
        auth_session = AuthSessionRecord(
            id=f"AUTH-{uuid.uuid4().hex.upper()}", token_hash=_hash(raw_token), csrf_hash=_hash(csrf_token),
            user_id=user.id, assurance_level=assurance_level, expires_at=now + ABSOLUTE_TIMEOUT,
            last_seen_at=now, ip_hash=_hash(ip) if ip else None,
            user_agent_hash=_hash(user_agent) if user_agent else None,
        )
        session.add(auth_session)
        context = AuthContext(auth_session.id, user.id, user.username, user.display_name, user.role,
                              user.customer_id, auth_session.assurance_level, user.phone_number, csrf_token)
        return context, raw_token, csrf_token

    def create_direct_session(
        self,
        username: str,
        *,
        ip: str = "127.0.0.1",
        user_agent: str = "testclient",
        assurance_level: str = "L2",
        scopes: tuple[str, ...] = ("openid", "profile", "banking.read", "banking.propose", "banking.execute"),
        client_id: str = "sentinel-web",
    ) -> tuple[AuthContext, str, str]:
        with self.runtime.sessions.begin() as session:
            user = session.scalar(select(UserRecord).where(UserRecord.username == username.strip().lower()))
            if not user or not user.active:
                raise ValueError(f"Active user {username} not found")
            context, raw_token, csrf_token = self._create_session(
                session, user, ip=ip, user_agent=user_agent, assurance_level=assurance_level
            )
            now = utc_dt()
            session.add(OAuthGrantRecord(
                id=f"OAG-{uuid.uuid4().hex.upper()}",
                auth_session_id=context.session_id,
                user_id=user.id,
                auth_subject=user.auth_subject or f"sub-{user.id}",
                provider_session_id=f"sid-{uuid.uuid4().hex[:8]}",
                client_id=client_id,
                encrypted_access_token="direct-test-token",
                encrypted_refresh_token=None,
                scopes=list(scopes),
                access_expires_at=now + timedelta(days=1),
                refresh_expires_at=None,
            ))
            return (
                AuthContext(
                    **{
                        **context.__dict__,
                        "auth_subject": user.auth_subject or f"sub-{user.id}",
                        "client_id": client_id,
                        "scopes": scopes,
                        "auth_source": "oidc",
                    }
                ),
                raw_token,
                csrf_token,
            )

    def create_session_for_subject(
        self,
        auth_subject: str,
        *,
        ip: str,
        user_agent: str,
        assurance_level: str = "L2",
        sentinel_user_id: str | None = None,
        username: str | None = None,
        client_id: str | None = None,
        scopes: tuple[str, ...] = (),
    ) -> tuple[AuthContext, str, str]:
        """Resolve a verified issuer subject and create Kosh's BFF cookie session."""
        with self.runtime.sessions.begin() as session:
            user = session.scalar(select(UserRecord).where(UserRecord.auth_subject == auth_subject))
            if user is None and sentinel_user_id:
                user = session.get(UserRecord, sentinel_user_id)
                if not user:
                    user = session.scalar(select(UserRecord).where(
                        (UserRecord.customer_id == sentinel_user_id) |
                        (UserRecord.id == sentinel_user_id)
                    ))
            if user is None and username:
                user = session.scalar(select(UserRecord).where(UserRecord.username == username.strip().lower()))
            if user:
                user.auth_subject = auth_subject
            if not user or not user.active:
                raise PermissionError("No active Kosh profile is linked to this identity")
            context, raw_token, csrf_token = self._create_session(
                session, user, ip=ip, user_agent=user_agent, assurance_level=assurance_level
            )
            return (
                AuthContext(
                    **{
                        **context.__dict__,
                        "auth_subject": auth_subject,
                        "client_id": client_id,
                        "scopes": scopes,
                        "auth_source": "oidc",
                    }
                ),
                raw_token,
                csrf_token,
            )

    def context_for_subject(
        self,
        auth_subject: str,
        *,
        assurance_level: str,
        client_id: str,
        scopes: tuple[str, ...],
        session_id: str = "oauth-bearer",
    ) -> AuthContext | None:
        with self.runtime.sessions() as session:
            user = session.scalar(select(UserRecord).where(UserRecord.auth_subject == auth_subject))
            if not user or not user.active:
                return None
            return AuthContext(
                session_id=session_id,
                user_id=user.id,
                username=user.username,
                display_name=user.display_name,
                role=user.role,
                customer_id=user.customer_id,
                assurance_level=assurance_level,
                phone_number=user.phone_number,
                auth_subject=auth_subject,
                client_id=client_id,
                scopes=scopes,
                auth_source="oidc",
            )

    def profile_exists(self, phone_number: str) -> bool:
        with self.runtime.sessions() as session:
            return session.scalar(select(UserRecord.id).where(
                UserRecord.phone_number == normalize_phone(phone_number)
            )) is not None

    def username_exists(self, username: str) -> bool:
        if not username:
            return False
        with self.runtime.sessions() as session:
            return session.scalar(select(UserRecord.id).where(
                UserRecord.username == username.strip().lower()
            )) is not None

    def resolve(self, raw_token: str | None, *, touch: bool = True) -> AuthContext | None:
        if not raw_token:
            return None
        now = utc_dt()
        with self.runtime.sessions.begin() as session:
            row = session.scalar(select(AuthSessionRecord).where(AuthSessionRecord.token_hash == _hash(raw_token)))
            if not row or row.revoked_at or _aware(row.expires_at) <= now or _aware(row.last_seen_at) + IDLE_TIMEOUT <= now:
                if row and not row.revoked_at:
                    row.revoked_at = now
                return None
            if row.assurance_level == "L3" and (not row.step_up_expires_at or _aware(row.step_up_expires_at) <= now):
                row.assurance_level = "L2"
                row.step_up_expires_at = None
            if touch:
                row.last_seen_at = now
            user = row.user
            if not user.active:
                return None
            return AuthContext(row.id, user.id, user.username, user.display_name, user.role,
                               user.customer_id, row.assurance_level, user.phone_number,
                               auth_subject=user.auth_subject,
                               auth_source="oidc")

    def elevate_session(self, raw_token: str, assurance_level: str = "L3") -> None:
        with self.runtime.sessions.begin() as session:
            row = session.scalar(select(AuthSessionRecord).where(AuthSessionRecord.token_hash == _hash(raw_token)))
            if row:
                row.assurance_level = assurance_level
                row.step_up_expires_at = utc_dt() + timedelta(minutes=15)

    def verify_csrf(self, raw_token: str, csrf_token: str | None) -> bool:
        if not csrf_token:
            return False
        with self.runtime.sessions() as session:
            row = session.scalar(select(AuthSessionRecord).where(AuthSessionRecord.token_hash == _hash(raw_token)))
            return bool(row and not row.revoked_at and secrets.compare_digest(row.csrf_hash, _hash(csrf_token)))

    def rotate_csrf(self, raw_token: str) -> str:
        csrf_token = secrets.token_urlsafe(24)
        with self.runtime.sessions.begin() as session:
            row = session.scalar(select(AuthSessionRecord).where(AuthSessionRecord.token_hash == _hash(raw_token)))
            if not row or row.revoked_at:
                raise PermissionError("Authentication session is no longer active")
            row.csrf_hash = _hash(csrf_token)
        return csrf_token

    def revoke(self, raw_token: str) -> None:
        with self.runtime.sessions.begin() as session:
            row = session.scalar(select(AuthSessionRecord).where(AuthSessionRecord.token_hash == _hash(raw_token)))
            if row and not row.revoked_at:
                row.revoked_at = utc_dt()

    def active_consent(self, customer_id: str | None) -> dict[str, Any] | None:
        if not customer_id:
            return None
        with self.runtime.sessions() as session:
            row = session.scalar(select(ConsentRecord).where(
                ConsentRecord.customer_id == customer_id,
                ConsentRecord.purpose == CONSENT_PURPOSE,
                ConsentRecord.revoked_at.is_(None),
                ConsentRecord.terms_version == TERMS_VERSION,
            ).order_by(ConsentRecord.granted_at.desc()))
            return self._consent_dict(row) if row else None

    def capture_consent(self, customer_id: str, scope: list[str] | None = None) -> dict[str, Any]:
        allowed_scope = [item for item in (scope or CONSENT_SCOPE) if item in CONSENT_SCOPE]
        if not allowed_scope:
            raise ValueError("At least one valid consent scope is required")
        with self.runtime.sessions.begin() as session:
            existing = session.scalars(select(ConsentRecord).where(
                ConsentRecord.customer_id == customer_id,
                ConsentRecord.purpose == CONSENT_PURPOSE,
                ConsentRecord.revoked_at.is_(None),
            )).all()
            now = utc_dt()
            for record in existing:
                record.revoked_at = now
            row = ConsentRecord(id=f"CNS-{uuid.uuid4().hex.upper()}", customer_id=customer_id,
                                purpose=CONSENT_PURPOSE, scope=allowed_scope, terms_version=TERMS_VERSION,
                                capture_method="AUTHENTICATED_EXPLICIT_ACTION", granted_at=now)
            session.add(row)
            return self._consent_dict(row)

    def revoke_consent(self, customer_id: str) -> bool:
        changed = False
        with self.runtime.sessions.begin() as session:
            rows = session.scalars(select(ConsentRecord).where(
                ConsentRecord.customer_id == customer_id,
                ConsentRecord.purpose == CONSENT_PURPOSE,
                ConsentRecord.revoked_at.is_(None),
            )).all()
            for row in rows:
                row.revoked_at = utc_dt()
                changed = True
        return changed

    def create_onboarded_profile(
        self,
        full_name: str,
        phone_number: str,
        username: str,
        customer_id: str,
    ) -> dict[str, str]:
        """Create the Kosh banking profile. Credentials live only in the Better Auth service."""
        normalized_phone = normalize_phone(phone_number)
        norm_username = username.strip().lower()
        now = utc_dt()
        with self.runtime.sessions.begin() as session:
            existing = session.scalar(select(UserRecord).where(
                (UserRecord.username == norm_username) | (UserRecord.phone_number == normalized_phone)
            ))
            if existing:
                raise ValueError("An account with this username or mobile number already exists")
            else:
                user_id = f"USR-{customer_id}-{uuid.uuid4().hex[:6].upper()}"
                user = UserRecord(
                    id=user_id,
                    username=norm_username,
                    phone_number=normalized_phone,
                    password_hash=None,
                    display_name=full_name,
                    role="CUSTOMER",
                    customer_id=customer_id,
                    active=True,
                )
                session.add(user)

            # Auto-provision digital banking consent
            cns_id = f"CNS-{uuid.uuid4().hex.upper()}"
            consent_row = ConsentRecord(
                id=cns_id,
                customer_id=customer_id,
                purpose=CONSENT_PURPOSE,
                scope=CONSENT_SCOPE,
                terms_version=TERMS_VERSION,
                capture_method="INSTANT_ONBOARDING_TERMS_ACCEPTED",
                granted_at=now,
            )
            session.add(consent_row)

            return {
                "user_id": user.id,
                "customer_id": customer_id,
                "display_name": user.display_name,
                "username": norm_username,
                "phone_number": normalized_phone,
            }

    @staticmethod
    def _consent_dict(row: ConsentRecord) -> dict[str, Any]:
        return {"id": row.id, "purpose": row.purpose, "scope": list(row.scope),
                "terms_version": row.terms_version, "capture_method": row.capture_method,
                "granted_at": row.granted_at.isoformat().replace("+00:00", "Z")}



def secure_cookie_enabled() -> bool:
    return os.getenv("SENTINEL_COOKIE_SECURE", "false").lower() in {"1", "true", "yes"}
