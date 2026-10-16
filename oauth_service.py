"""OAuth 2.1/OIDC resource-server and BFF primitives for Kosh."""

from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import threading
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import replace
from datetime import datetime, timedelta
from typing import Any

import jwt
from backend.settings import PRODUCTION
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import select

from auth_service import AuthContext, AuthService, _aware, _hash
from persistence import (
    ConversationRecord,
    AuthSessionRecord,
    OAuthGrantRecord,
    OAuthLoginStateRecord,
    WebSocketTicketRecord,
    utc_dt,
)


class StepUpLocked(PermissionError):
    """Too many wrong codes on this sign-in session. Locks the session, not the person, so a shared demo number is not a lockout."""

    def __init__(self, minutes: int):
        self.minutes = max(1, minutes)
        super().__init__(f"Too many wrong codes. Try again in {self.minutes} minute{'s' if self.minutes != 1 else ''}.")


ASSURANCE_CLAIM = "https://sentinel/auth/assurance"
ASSURANCE_EXPIRES_CLAIM = "https://sentinel/auth/assurance_expires_at"
SENTINEL_USER_CLAIM = "https://sentinel/auth/sentinel_user_id"
SENTINEL_USERNAME_CLAIM = "https://sentinel/auth/username"
DEFAULT_SCOPES = ("openid", "profile", "offline_access", "banking.read", "banking.propose")


def _b64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


class TokenCipher:
    def __init__(self, secret: str) -> None:
        self._key = hashlib.sha256(secret.encode("utf-8")).digest()

    def encrypt(self, value: str) -> str:
        nonce = secrets.token_bytes(12)
        encrypted = AESGCM(self._key).encrypt(nonce, value.encode("utf-8"), b"sentinel-oauth-v1")
        return _b64url(nonce + encrypted)

    def decrypt(self, value: str) -> str:
        padded = value + "=" * (-len(value) % 4)
        raw = base64.urlsafe_b64decode(padded)
        return AESGCM(self._key).decrypt(raw[:12], raw[12:], b"sentinel-oauth-v1").decode("utf-8")


class OAuthService:
    def __init__(self, auth_service: AuthService) -> None:
        self.auth_service = auth_service
        self.runtime = auth_service.runtime
        self.auth_url = os.getenv("BETTER_AUTH_URL", "http://127.0.0.1:8020").rstrip("/")
        self.issuer = os.getenv("BETTER_AUTH_ISSUER", f"{self.auth_url}/api/auth").rstrip("/")
        self.audience = os.getenv("OAUTH_AUDIENCE", "http://127.0.0.1:8017/api")
        self.sentinel_url = os.getenv("SENTINEL_PUBLIC_URL", "http://127.0.0.1:8017").rstrip("/")
        self.web_client_id = os.getenv("OAUTH_WEB_CLIENT_ID", "sentinel-web")
        self.web_client_secret = os.getenv("OAUTH_WEB_CLIENT_SECRET", "sentinel-web-development-secret")
        self.chat_client_id = os.getenv("OAUTH_CHAT_CLIENT_ID", "sentinel-chat")
        self.chat_client_secret = os.getenv("OAUTH_CHAT_CLIENT_SECRET", "sentinel-chat-development-secret")
        self.allowed_clients = {self.web_client_id, self.chat_client_id}
        # Outside agents the bank has registered (OAUTH_AGENT_CLIENT_IDS). Their tokens are accepted only by the MCP gateway.
        self.mcp_audience = os.getenv("OAUTH_MCP_AUDIENCE", f"{self.sentinel_url}/mcp")
        self.agent_clients = {item.strip() for item in os.getenv("OAUTH_AGENT_CLIENT_IDS", "").split(",") if item.strip()}
        self._secrets = {self.web_client_id: self.web_client_secret, self.chat_client_id: self.chat_client_secret}
        self.authorization_endpoint = os.getenv("OAUTH_AUTHORIZATION_ENDPOINT", f"{self.issuer}/oauth2/authorize")
        self.token_endpoint = os.getenv("OAUTH_TOKEN_ENDPOINT", f"{self.issuer}/oauth2/token")
        self.revocation_endpoint = os.getenv("OAUTH_REVOCATION_ENDPOINT", f"{self.issuer}/oauth2/revoke")
        self.jwks_uri = os.getenv("OAUTH_JWKS_URI", f"{self.issuer}/jwks")
        production = PRODUCTION
        if production and (not os.getenv("OAUTH_WEB_CLIENT_SECRET") or not os.getenv("OAUTH_CHAT_CLIENT_SECRET")):
            raise RuntimeError("OAuth client secrets are required in production")
        encryption_secret = os.getenv("OAUTH_TOKEN_ENCRYPTION_KEY") or os.getenv("SENTINEL_AUDIT_HMAC_KEY")
        if not encryption_secret:
            if production:
                raise RuntimeError("OAUTH_TOKEN_ENCRYPTION_KEY is required in production")
            encryption_secret = "sentinel-only-for-local-development"
        self.cipher = TokenCipher(encryption_secret)
        self._jwks_client: jwt.PyJWKClient | None = None
        self._refresh_lock = threading.Lock()

    @staticmethod
    def safe_return_to(value: str | None, default: str = "/") -> str:
        candidate = (value or default).strip()
        parsed = urllib.parse.urlsplit(candidate)
        if not candidate.startswith("/") or candidate.startswith("//") or parsed.scheme or parsed.netloc:
            return default
        return candidate

    def _client(self, kind: str) -> tuple[str, str, str]:
        if kind == "chat":
            return self.chat_client_id, self.chat_client_secret, f"{self.sentinel_url}/api/chat/oauth/callback"
        return self.web_client_id, self.web_client_secret, f"{self.sentinel_url}/api/auth/callback"

    def begin_authorization(
        self,
        *,
        kind: str = "web",
        return_to: str = "/",
        chat_session_id: str | None = None,
    ) -> str:
        client_id, _, redirect_uri = self._client(kind)
        state = secrets.token_urlsafe(32)
        verifier = secrets.token_urlsafe(64)
        nonce = secrets.token_urlsafe(32)
        challenge = _b64url(hashlib.sha256(verifier.encode("ascii")).digest())
        now = utc_dt()
        with self.runtime.sessions.begin() as session:
            session.add(OAuthLoginStateRecord(
                id=f"OAS-{uuid.uuid4().hex.upper()}",
                state_hash=_hash(state),
                encrypted_verifier=self.cipher.encrypt(verifier),
                nonce=nonce,
                client_id=client_id,
                redirect_uri=redirect_uri,
                return_to=self.safe_return_to(return_to),
                chat_session_id=chat_session_id,
                expires_at=now + timedelta(minutes=5),
            ))
        query = urllib.parse.urlencode({
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "scope": " ".join(DEFAULT_SCOPES),
            "resource": self.audience,
            "state": state,
            "nonce": nonce,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        })
        return f"{self.authorization_endpoint}?{query}"

    def idp_sign_out_url(self, return_to: str | None = None) -> str | None:
        target = self.sentinel_url if not return_to or not return_to.startswith("/") else f"{self.sentinel_url}{return_to}"
        base = self.issuer.replace("/api/auth", "")
        query = urllib.parse.urlencode({"return_to": target})
        return f"{base}/sign-out?{query}"

    def consume_state(self, state: str) -> OAuthLoginStateRecord:
        now = utc_dt()
        with self.runtime.sessions.begin() as session:
            row = session.execute(
                select(OAuthLoginStateRecord)
                .where(OAuthLoginStateRecord.state_hash == _hash(state))
                .with_for_update()
            ).scalar_one_or_none()
            if not row or row.consumed_at or _aware(row.expires_at) <= now:
                raise PermissionError("OAuth state is invalid, expired, or already used")
            row.consumed_at = now
            session.flush()
            session.expunge(row)
            return row

    @staticmethod
    def _post_form(url: str, body: dict[str, str], client_id: str, client_secret: str) -> dict[str, Any]:
        basic = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
        request = urllib.request.Request(
            url,
            data=urllib.parse.urlencode(body).encode(),
            method="POST",
            headers={
                "Authorization": f"Basic {basic}",
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                content = response.read().decode("utf-8")
                if not content.strip():
                    return {}
                return json.loads(content)
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:500]
            raise PermissionError(f"OAuth endpoint rejected the request ({exc.code}): {detail}") from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise ConnectionError("OAuth authority is unavailable") from exc

    def exchange_code(self, code: str, state_row: OAuthLoginStateRecord) -> dict[str, Any]:
        _, secret, _ = self._client("chat" if state_row.client_id == self.chat_client_id else "web")
        return self._post_form(self.token_endpoint, {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": state_row.redirect_uri,
            "code_verifier": self.cipher.decrypt(state_row.encrypted_verifier),
            "resource": self.audience,
        }, state_row.client_id, secret)

    def _jwks(self) -> jwt.PyJWKClient:
        if self._jwks_client is None:
            self._jwks_client = jwt.PyJWKClient(self.jwks_uri, cache_keys=True, lifespan=300)
        return self._jwks_client

    def decode_token(
        self,
        token: str,
        *,
        audience: str,
        nonce: str | None = None,
    ) -> dict[str, Any]:
        try:
            signing_key = self._jwks().get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=["EdDSA", "ES256", "RS256"],
                audience=audience,
                issuer=self.issuer,
                options={"require": ["exp", "iat", "iss", "sub", "aud"]},
            )
        except jwt.PyJWTError as exc:
            raise PermissionError("OAuth token validation failed") from exc
        if nonce is not None and not secrets.compare_digest(str(claims.get("nonce") or ""), nonce):
            raise PermissionError("OIDC nonce validation failed")
        return claims

    @staticmethod
    def scopes_from_claims(claims: dict[str, Any]) -> tuple[str, ...]:
        value = claims.get("scope", "")
        if isinstance(value, str):
            return tuple(item for item in value.split() if item)
        if isinstance(value, list):
            return tuple(str(item) for item in value)
        return ()

    @staticmethod
    def assurance_from_claims(claims: dict[str, Any]) -> str:
        if claims.get(ASSURANCE_CLAIM) != "L3":
            return "L2"
        raw_expiry = claims.get(ASSURANCE_EXPIRES_CLAIM)
        try:
            expiry = datetime.fromisoformat(str(raw_expiry).replace("Z", "+00:00"))
        except (TypeError, ValueError):
            return "L2"
        return "L3" if expiry > utc_dt() else "L2"

    def context_from_access_token(self, token: str, required_scopes: tuple[str, ...] = (), *, agent: bool = False) -> AuthContext:
        """agent=False: Kosh's own web and chat clients (REST and chat). agent=True: registered outside agents (MCP only)."""
        # Agent tokens are issued for the MCP gateway's own audience, so they are useless against Kosh's API, and vice versa.
        claims = self.decode_token(token, audience=self.mcp_audience if agent else self.audience)
        client_id = str(claims.get("client_id") or claims.get("azp") or "")
        if client_id not in (self.agent_clients if agent else self.allowed_clients):
            raise PermissionError("OAuth client is not authorized for this Kosh interface")
        scopes = self.scopes_from_claims(claims)
        if not set(required_scopes).issubset(scopes):
            raise PermissionError("OAuth token is missing a required scope")
        context = self.auth_service.context_for_subject(
            str(claims["sub"]),
            assurance_level=self.assurance_from_claims(claims),
            client_id=client_id,
            scopes=scopes,
            session_id=str(claims.get("sid") or "oauth-bearer"),
        )
        if not context:
            raise PermissionError("OAuth subject is not linked to a Kosh user")
        return context

    def establish_bff_session(
        self,
        tokens: dict[str, Any],
        state_row: OAuthLoginStateRecord,
        *,
        ip: str,
        user_agent: str,
    ) -> tuple[AuthContext, str, str]:
        access_token = str(tokens.get("access_token") or "")
        id_token = str(tokens.get("id_token") or "")
        if not access_token or not id_token:
            raise PermissionError("OAuth token response is incomplete")
        id_claims = self.decode_token(id_token, audience=state_row.client_id, nonce=state_row.nonce)
        access_claims = self.decode_token(access_token, audience=self.audience)
        if access_claims.get("sub") != id_claims.get("sub"):
            raise PermissionError("OAuth subject mismatch")
        provider_session_id = str(access_claims.get("sid") or "")
        if not provider_session_id:
            raise PermissionError("OAuth access token is not bound to an authorization session")
        token_client = str(access_claims.get("client_id") or access_claims.get("azp") or "")
        if token_client != state_row.client_id:
            raise PermissionError("OAuth token was issued to another client")
        scopes = self.scopes_from_claims(access_claims)
        required = {"openid", "banking.read"}
        if not required.issubset(scopes):
            raise PermissionError("OAuth grant is missing required Kosh scopes")
        context, raw_cookie, csrf_token = self.auth_service.create_session_for_subject(
            str(access_claims["sub"]),
            sentinel_user_id=str(access_claims.get(SENTINEL_USER_CLAIM) or id_claims.get(SENTINEL_USER_CLAIM) or "") or None,
            username=str(access_claims.get(SENTINEL_USERNAME_CLAIM) or id_claims.get(SENTINEL_USERNAME_CLAIM) or "") or None,
            assurance_level=self.assurance_from_claims(access_claims),
            client_id=state_row.client_id,
            scopes=scopes,
            ip=ip,
            user_agent=user_agent,
        )
        now = utc_dt()
        expires_in = max(3600, int(tokens.get("expires_in") or 3600))
        with self.runtime.sessions.begin() as session:
            session.add(OAuthGrantRecord(
                id=f"OAG-{uuid.uuid4().hex.upper()}",
                auth_session_id=context.session_id,
                user_id=context.user_id,
                auth_subject=str(access_claims["sub"]),
                provider_session_id=provider_session_id,
                client_id=state_row.client_id,
                encrypted_access_token=self.cipher.encrypt(access_token),
                encrypted_refresh_token=self.cipher.encrypt(str(tokens["refresh_token"])) if tokens.get("refresh_token") else None,
                scopes=list(scopes),
                access_expires_at=now + timedelta(seconds=expires_in),
                refresh_expires_at=now + timedelta(days=30) if tokens.get("refresh_token") else None,
            ))
        return context, raw_cookie, csrf_token

    def _refresh_grant(self, grant_id: str, *, force: bool = False) -> tuple[tuple[str, ...], str]:
        with self._refresh_lock:
            with self.runtime.sessions() as session:
                grant = session.get(OAuthGrantRecord, grant_id)
                if (
                    not grant
                    or grant.revoked_at
                    or not grant.encrypted_refresh_token
                    or (grant.refresh_expires_at and _aware(grant.refresh_expires_at) <= utc_dt())
                ):
                    raise PermissionError("OAuth grant is no longer refreshable")
                # If not forcing and another concurrent request just refreshed this grant while we waited for the lock:
                if not force and _aware(grant.access_expires_at) > utc_dt():
                    auth_session = session.get(AuthSessionRecord, grant.auth_session_id)
                    assurance = auth_session.assurance_level if auth_session else "L2"
                    return tuple(grant.scopes or []), assurance
                refresh_token = self.cipher.decrypt(grant.encrypted_refresh_token)
                client_id = grant.client_id
                auth_subject = grant.auth_subject
                secret = self._secrets[client_id]

            try:
                tokens = self._post_form(self.token_endpoint, {
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                    "resource": self.audience,
                }, client_id, secret)
                access_token = str(tokens.get("access_token") or "")
                claims = self.decode_token(access_token, audience=self.audience)
                token_client = str(claims.get("client_id") or claims.get("azp") or "")
                if claims.get("sub") != auth_subject or token_client != client_id:
                    raise PermissionError("Refreshed OAuth token identity mismatch")
            except PermissionError:
                with self.runtime.sessions() as session:
                    stored = session.get(OAuthGrantRecord, grant_id)
                    if stored and _aware(stored.access_expires_at) > utc_dt():
                        # A concurrent request already refreshed the grant successfully
                        auth_session = session.get(AuthSessionRecord, stored.auth_session_id)
                        assurance = auth_session.assurance_level if auth_session else "L2"
                        return tuple(stored.scopes or []), assurance
                with self.runtime.sessions.begin() as session:
                    stored = session.get(OAuthGrantRecord, grant_id)
                    if stored and not stored.revoked_at and _aware(stored.access_expires_at) <= utc_dt():
                        stored.revoked_at = utc_dt()
                raise

            scopes = self.scopes_from_claims(claims)
            assurance = self.assurance_from_claims(claims)
            now = utc_dt()
            with self.runtime.sessions.begin() as session:
                stored = session.get(OAuthGrantRecord, grant_id)
                if not stored or stored.revoked_at:
                    raise PermissionError("OAuth grant is no longer active")
                stored.encrypted_access_token = self.cipher.encrypt(access_token)
                if tokens.get("refresh_token"):
                    stored.encrypted_refresh_token = self.cipher.encrypt(str(tokens["refresh_token"]))
                stored.scopes = list(scopes)
                expires_in = max(3600, int(tokens.get("expires_in") or 3600))
                stored.access_expires_at = now + timedelta(seconds=expires_in)
                stored.updated_at = now
                auth_session = session.get(AuthSessionRecord, stored.auth_session_id)
                if auth_session:
                    auth_session.assurance_level = assurance
                    if assurance == "L3":
                        raw_expiry = claims.get(ASSURANCE_EXPIRES_CLAIM)
                        auth_session.step_up_expires_at = datetime.fromisoformat(
                            str(raw_expiry).replace("Z", "+00:00")
                        ) if raw_expiry else now + timedelta(seconds=300)
                    else:
                        auth_session.step_up_expires_at = None
            return scopes, assurance

    def enrich_cookie_context(self, context: AuthContext) -> AuthContext | None:
        with self.runtime.sessions() as session:
            grant = session.scalar(select(OAuthGrantRecord).where(
                OAuthGrantRecord.auth_session_id == context.session_id,
                OAuthGrantRecord.revoked_at.is_(None),
            ).order_by(OAuthGrantRecord.created_at.desc()))
            if not grant:
                return context
            grant_id = grant.id
            auth_subject = grant.auth_subject
            client_id = grant.client_id
            scopes = tuple(grant.scopes or [])
            access_expired = _aware(grant.access_expires_at) <= utc_dt()
        if access_expired:
            try:
                scopes, assurance = self._refresh_grant(grant_id)
            except (PermissionError, ConnectionError):
                return None
            context = replace(context, assurance_level=assurance)
        return replace(
            context,
            auth_subject=auth_subject,
            client_id=client_id,
            scopes=scopes,
        )

    def create_websocket_ticket(self, context: AuthContext, chat_session_id: str | None) -> str:
        ticket = secrets.token_urlsafe(32)
        with self.runtime.sessions.begin() as session:
            session.add(WebSocketTicketRecord(
                id=f"WST-{uuid.uuid4().hex.upper()}",
                ticket_hash=_hash(ticket),
                user_id=context.user_id,
                chat_session_id=chat_session_id,
                expires_at=utc_dt() + timedelta(seconds=30),
            ))
        return ticket

    def consume_websocket_ticket(self, ticket: str, chat_session_id: str | None) -> AuthContext | None:
        now = utc_dt()
        with self.runtime.sessions.begin() as session:
            row = session.execute(select(WebSocketTicketRecord).where(
                WebSocketTicketRecord.ticket_hash == _hash(ticket),
            ).with_for_update()).scalar_one_or_none()
            if (
                not row
                or row.consumed_at
                or _aware(row.expires_at) <= now
                or row.chat_session_id != chat_session_id
            ):
                return None
            row.consumed_at = now
            user = row.user_id
        with self.runtime.sessions() as session:
            from persistence import UserRecord
            record = session.get(UserRecord, user)
            if not record or not record.active:
                return None
            return AuthContext(
                session_id=f"ws:{row.id}", user_id=record.id, username=record.username,
                display_name=record.display_name, role=record.role, customer_id=record.customer_id,
                assurance_level="L2", phone_number=record.phone_number,
                auth_subject=record.auth_subject, client_id=self.chat_client_id,
                scopes=("openid", "profile", "banking.read", "banking.propose"),
            )

    def transfer_chat(self, chat_session_id: str | None, context: AuthContext) -> None:
        if not chat_session_id:
            return
        with self.runtime.sessions.begin() as session:
            row = session.get(ConversationRecord, chat_session_id)
            if row is None:
                row = ConversationRecord(
                    id=chat_session_id,
                    user_id=context.user_id,
                    customer_id=context.customer_id,
                    title="Authenticated chat",
                    product="sentinel-v2",
                    messages=[],
                    traces=[],
                )
                session.add(row)
            elif row.user_id and row.user_id != context.user_id:
                raise PermissionError("Chat session belongs to another user")
            else:
                row.user_id = context.user_id
                row.customer_id = context.customer_id
                row.updated_at = utc_dt()

    def revoke_session_grants(self, auth_session_id: str) -> None:
        now = utc_dt()
        pending: list[tuple[str, str, str]] = []
        with self.runtime.sessions.begin() as session:
            rows = session.scalars(select(OAuthGrantRecord).where(
                OAuthGrantRecord.auth_session_id == auth_session_id,
                OAuthGrantRecord.revoked_at.is_(None),
            )).all()
            for row in rows:
                row.revoked_at = now
                if row.encrypted_refresh_token:
                    secret = self._secrets[row.client_id]
                    pending.append((self.cipher.decrypt(row.encrypted_refresh_token), row.client_id, secret))
        for refresh_token, client_id, secret in pending:
            try:
                self._post_form(self.revocation_endpoint, {
                    "token": refresh_token,
                    "token_type_hint": "refresh_token",
                }, client_id, secret)
            except Exception:
                # Local revocation is authoritative for Sentinel; upstream retry belongs in an outbox in production.
                continue

    def step_up_with_firebase(self, auth_session_id: str, id_token: str | None, *, code: str | None = None,
                              phone: str | None = None) -> int:
        """Reauthenticate at Firebase, then rotate the grant so new JWTs carry L3."""
        self._refuse_while_locked(auth_session_id)
        with self.runtime.sessions() as session:
            grant = session.scalar(select(OAuthGrantRecord).where(
                OAuthGrantRecord.auth_session_id == auth_session_id,
                OAuthGrantRecord.revoked_at.is_(None),
            ).order_by(OAuthGrantRecord.created_at.desc()))
            if not grant or not grant.encrypted_refresh_token or not grant.provider_session_id:
                raise PermissionError("No refreshable OAuth grant is active")
            provider_session_id = grant.provider_session_id
            grant_id = grant.id

        request = urllib.request.Request(
            f"{self.issuer}/firebase/step-up",
            # Demo OTP mode sends the customer's own number and the demo code; the auth server checks both, no SMS.
            data=json.dumps({**({"idToken": id_token} if id_token else {"phoneNumber": phone or "", "code": code or ""}),
                             "sessionId": provider_session_id}).encode("utf-8"),
            method="POST",
            headers={"Content-Type": "application/json", "Accept": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                if response.status >= 300:
                    raise PermissionError("Firebase step-up was rejected")
        except urllib.error.HTTPError as exc:
            self._step_up_failed(auth_session_id)  # a wrong or expired code counts; an unreachable service (below) does not
            raise PermissionError("Firebase step-up was rejected") from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise ConnectionError("OAuth authority is unavailable") from exc
        except PermissionError:
            self._step_up_failed(auth_session_id)
            raise

        _, assurance = self._refresh_grant(grant_id, force=True)  # rotates the grant; new JWTs carry the step-up
        if assurance != "L3":
            raise PermissionError("Refreshed token did not satisfy L3 assurance")
        self._step_up_succeeded(auth_session_id)
        return 300

    # --- PARAM_STEP_UP_MAX_FAILURES wrong codes lock step-up on this session for PARAM_STEP_UP_LOCK_MINUTES
    def _refuse_while_locked(self, auth_session_id: str) -> None:
        with self.runtime.sessions() as session:
            row = session.get(AuthSessionRecord, auth_session_id)
            until = _aware(row.step_up_locked_until) if row and row.step_up_locked_until else None
        if until and until > utc_dt():
            raise StepUpLocked(int((until - utc_dt()).total_seconds() // 60) + 1)

    def _step_up_failed(self, auth_session_id: str) -> None:
        from backend import harness
        limit = int(harness.parameter("PARAM_STEP_UP_MAX_FAILURES", 3))
        minutes = int(harness.parameter("PARAM_STEP_UP_LOCK_MINUTES", 30))
        locked = False
        with self.runtime.sessions.begin() as session:
            row = session.get(AuthSessionRecord, auth_session_id)
            if not row:
                return
            row.step_up_failures = (row.step_up_failures or 0) + 1
            if row.step_up_failures >= limit:
                row.step_up_locked_until = utc_dt() + timedelta(minutes=minutes)
                row.step_up_failures = 0
                locked = True
        if locked:
            raise StepUpLocked(minutes)

    def _step_up_succeeded(self, auth_session_id: str) -> None:
        with self.runtime.sessions.begin() as session:
            row = session.get(AuthSessionRecord, auth_session_id)
            if row:
                row.step_up_failures = 0
                row.step_up_locked_until = None
