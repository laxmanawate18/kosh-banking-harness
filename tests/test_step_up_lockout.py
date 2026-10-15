"""PARAM_STEP_UP_MAX_FAILURES wrong codes lock step-up on that sign-in session for PARAM_STEP_UP_LOCK_MINUTES.

The lock belongs to the session, not the person: judges share one demo number, and one person's typos must not lock out the rest."""
from __future__ import annotations

import urllib.error
import urllib.parse
from datetime import timedelta
from unittest.mock import patch

import pytest
from sqlalchemy import select

import oauth_service
from auth_service import AuthService
from backend import harness
from oauth_service import OAuthService, StepUpLocked
from persistence import AuthSessionRecord, DatabaseRuntime, OAuthGrantRecord, UserRecord, utc_dt


@pytest.fixture()
def oauth(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "oidc")
    monkeypatch.setenv("OAUTH_TOKEN_ENCRYPTION_KEY", "test-encryption-secret")
    runtime = DatabaseRuntime(f"sqlite+pysqlite:///{tmp_path / 'stepup.sqlite3'}")
    runtime.initialize()
    service = OAuthService(AuthService(runtime))
    with runtime.sessions.begin() as session:
        session.get(UserRecord, "USR-CUSTOMER-001").auth_subject = "subject-1"
    return service


def sign_in(oauth, monkeypatch, provider_session: str) -> str:
    """A real BFF session (with a refreshable grant); returns its id."""
    state = urllib.parse.parse_qs(urllib.parse.urlsplit(oauth.begin_authorization()).query)["state"][0]
    state_row = oauth.consume_state(state)

    def decode(token, *, audience, nonce=None):
        if token == "id-token":
            return {"sub": "subject-1", "https://sentinel/auth/sentinel_user_id": "USR-CUSTOMER-001"}
        return {"sub": "subject-1", "client_id": oauth.web_client_id, "sid": provider_session,
                "scope": "openid profile offline_access banking.read banking.propose", "https://sentinel/auth/assurance": "L2"}

    monkeypatch.setattr(oauth, "decode_token", decode)
    context, _, _ = oauth.establish_bff_session({"access_token": "a", "id_token": "id-token", "refresh_token": "r", "expires_in": 300},
                                                state_row, ip="127.0.0.1", user_agent="pytest")
    return context.session_id


class Answer:
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def rejected(*_args, **_kwargs):
    raise urllib.error.HTTPError("http://auth/firebase/step-up", 401, "wrong code", {}, None)


def accepted(*_args, **_kwargs):
    return Answer()


def unreachable(*_args, **_kwargs):
    raise urllib.error.URLError("auth server down")


def try_code(oauth, session_id: str, answer):
    with patch.object(oauth_service.urllib.request, "urlopen", answer), patch.object(oauth, "_refresh_grant", return_value=(None, "L3")):
        return oauth.step_up_with_firebase(session_id, None, code="000000", phone="+919876543210")


def test_the_third_wrong_code_locks_the_session_and_a_right_code_is_then_refused(oauth, monkeypatch):
    session_id = sign_in(oauth, monkeypatch, "p1")
    for _ in range(2):
        with pytest.raises(PermissionError) as wrong:
            try_code(oauth, session_id, rejected)
        assert not isinstance(wrong.value, StepUpLocked)
    with pytest.raises(StepUpLocked) as locked:
        try_code(oauth, session_id, rejected)
    assert locked.value.minutes == 30
    assert "Try again in 30 minutes" in str(locked.value)
    with pytest.raises(StepUpLocked):  # even the right code waits out the lock
        try_code(oauth, session_id, accepted)


def test_another_session_of_the_same_user_is_not_locked(oauth, monkeypatch):
    first = sign_in(oauth, monkeypatch, "p1")
    for _ in range(3):
        with pytest.raises(PermissionError):
            try_code(oauth, first, rejected)
    second = sign_in(oauth, monkeypatch, "p2")
    assert try_code(oauth, second, accepted) == 300


def test_a_right_code_clears_the_count(oauth, monkeypatch):
    session_id = sign_in(oauth, monkeypatch, "p1")
    for _ in range(2):
        with pytest.raises(PermissionError):
            try_code(oauth, session_id, rejected)
    assert try_code(oauth, session_id, accepted) == 300
    for _ in range(2):  # two more wrong codes are again below the limit
        with pytest.raises(PermissionError) as wrong:
            try_code(oauth, session_id, rejected)
        assert not isinstance(wrong.value, StepUpLocked)


def test_an_unreachable_auth_server_is_not_a_wrong_code(oauth, monkeypatch):
    session_id = sign_in(oauth, monkeypatch, "p1")
    for _ in range(5):
        with pytest.raises(ConnectionError):
            try_code(oauth, session_id, unreachable)
    assert try_code(oauth, session_id, accepted) == 300


def test_the_lock_ends_after_its_time(oauth, monkeypatch):
    session_id = sign_in(oauth, monkeypatch, "p1")
    for _ in range(3):
        with pytest.raises(PermissionError):
            try_code(oauth, session_id, rejected)
    with oauth.runtime.sessions.begin() as session:
        session.get(AuthSessionRecord, session_id).step_up_locked_until = utc_dt() - timedelta(minutes=1)
    assert try_code(oauth, session_id, accepted) == 300


def test_the_limit_and_the_lock_time_come_from_the_governed_parameters(oauth, monkeypatch):
    session_id = sign_in(oauth, monkeypatch, "p1")
    real = harness.parameter
    monkeypatch.setattr(harness, "parameter", lambda name, default=None: {"PARAM_STEP_UP_MAX_FAILURES": 1,
                                                                          "PARAM_STEP_UP_LOCK_MINUTES": 5}.get(name, real(name, default)))
    with pytest.raises(StepUpLocked) as locked:
        try_code(oauth, session_id, rejected)
    assert locked.value.minutes == 5
