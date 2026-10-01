from __future__ import annotations

import urllib.parse

import pytest
from sqlalchemy import select

from auth_service import AuthService
from oauth_service import OAuthService
from persistence import DatabaseRuntime, OAuthGrantRecord, OAuthLoginStateRecord, UserRecord


@pytest.fixture()
def oauth(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "oidc")
    monkeypatch.setenv("OAUTH_TOKEN_ENCRYPTION_KEY", "test-encryption-secret")
    runtime = DatabaseRuntime(f"sqlite+pysqlite:///{tmp_path / 'oauth.sqlite3'}")
    runtime.initialize()
    auth = AuthService(runtime)
    return OAuthService(auth)


def test_pkce_state_is_server_side_and_single_use(oauth):
    url = oauth.begin_authorization(return_to="/banking?tab=accounts")
    query = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
    assert query["code_challenge_method"] == ["S256"]
    assert query["resource"] == [oauth.audience]
    assert query["prompt"] == ["login"]
    assert "code_verifier" not in query

    state = query["state"][0]
    consumed = oauth.consume_state(state)
    assert consumed.return_to == "/banking?tab=accounts"
    with pytest.raises(PermissionError):
        oauth.consume_state(state)


def test_idp_sign_out_url_formatting(oauth, monkeypatch):
    url = oauth.idp_sign_out_url("/dashboard")
    assert url is not None
    parsed = urllib.parse.urlsplit(url)
    assert parsed.path == "/sign-out"
    qs = urllib.parse.parse_qs(parsed.query)
    assert qs["return_to"] == [f"{oauth.sentinel_url}/dashboard"]


def test_open_redirect_is_rejected(oauth):
    assert oauth.safe_return_to("https://attacker.example/callback") == "/"
    assert oauth.safe_return_to("//attacker.example/callback") == "/"
    assert oauth.safe_return_to("/dashboard") == "/dashboard"


def test_bearer_scope_and_subject_mapping(oauth, monkeypatch):
    with oauth.runtime.sessions.begin() as session:
        user = session.get(UserRecord, "USR-CUSTOMER-001")
        user.auth_subject = "subject-1"

    monkeypatch.setattr(oauth, "decode_token", lambda *_args, **_kwargs: {
        "sub": "subject-1",
        "aud": oauth.audience,
        "client_id": oauth.chat_client_id,
        "scope": "openid banking.read banking.propose",
        "https://sentinel/auth/assurance": "L2",
    })
    context = oauth.context_from_access_token("signed", required_scopes=("banking.read",))
    assert context.user_id == "USR-CUSTOMER-001"
    assert context.client_id == oauth.chat_client_id
    with pytest.raises(PermissionError):
        oauth.context_from_access_token("signed", required_scopes=("banking.execute",))


def test_websocket_ticket_is_bound_and_single_use(oauth):
    with oauth.runtime.sessions.begin() as session:
        user = session.get(UserRecord, "USR-CUSTOMER-001")
        user.auth_subject = "subject-1"
    context = oauth.auth_service.context_for_subject(
        "subject-1",
        assurance_level="L2",
        client_id=oauth.chat_client_id,
        scopes=("banking.read", "banking.propose"),
    )
    assert context is not None
    ticket = oauth.create_websocket_ticket(context, "GUEST-12345678")
    assert oauth.consume_websocket_ticket(ticket, "GUEST-wrong") is None
    accepted = oauth.consume_websocket_ticket(ticket, "GUEST-12345678")
    assert accepted is not None
    assert accepted.user_id == context.user_id
    assert oauth.consume_websocket_ticket(ticket, "GUEST-12345678") is None


def test_state_records_never_store_plain_state(oauth):
    url = oauth.begin_authorization()
    state = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)["state"][0]
    with oauth.runtime.sessions() as session:
        row = session.scalar(select(OAuthLoginStateRecord))
        assert row is not None
        assert row.state_hash != state
        assert state not in row.encrypted_verifier


def test_bff_grant_is_bound_to_provider_session(oauth, monkeypatch):
    with oauth.runtime.sessions.begin() as session:
        user = session.get(UserRecord, "USR-CUSTOMER-001")
        user.auth_subject = "subject-1"

    authorization_url = oauth.begin_authorization()
    state = urllib.parse.parse_qs(urllib.parse.urlsplit(authorization_url).query)["state"][0]
    state_row = oauth.consume_state(state)

    def decode(token, *, audience, nonce=None):
        if token == "id-token":
            assert audience == oauth.web_client_id
            assert nonce == state_row.nonce
            return {"sub": "subject-1", "https://sentinel/auth/sentinel_user_id": "USR-CUSTOMER-001"}
        assert audience == oauth.audience
        return {
            "sub": "subject-1",
            "client_id": oauth.web_client_id,
            "sid": "provider-session-1",
            "scope": "openid profile offline_access banking.read banking.propose",
            "https://sentinel/auth/assurance": "L2",
        }

    monkeypatch.setattr(oauth, "decode_token", decode)
    context, cookie, csrf = oauth.establish_bff_session(
        {
            "access_token": "access-token",
            "id_token": "id-token",
            "refresh_token": "refresh-token",
            "expires_in": 300,
        },
        state_row,
        ip="127.0.0.1",
        user_agent="pytest",
    )
    assert cookie and csrf
    with oauth.runtime.sessions() as session:
        grant = session.scalar(select(OAuthGrantRecord))
        assert grant is not None
        assert grant.provider_session_id == "provider-session-1"
        assert oauth.cipher.decrypt(grant.encrypted_refresh_token) == "refresh-token"
