"""Deleting a customer takes two people: an officer asks, the admin decides. Access and contact details go; the records a
bank must keep stay, and the audit trail holds no personal data."""
import json
import secrets
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

import dev_ui
from banking_db import db


def login(username):
    client = TestClient(dev_ui.app)
    _, cookie, csrf = dev_ui.auth_service.create_direct_session(username)
    client.cookies.set(dev_ui.COOKIE_NAME, cookie)
    return client, {"X-CSRF-Token": csrf}


@pytest.fixture
def customer():
    phone, username = f"+9199{secrets.randbelow(90000000) + 10000000}", f"user_{secrets.token_hex(3)}"
    onboarded = db.onboard_customer_with_product(product={"id": "PROD-SAV-PREMIER", "title": "Test Savings", "category": "savings"},
                                                 full_name="Deletion Test User", phone_number=phone, username=username)
    dev_ui.auth_service.create_onboarded_profile(full_name="Deletion Test User", phone_number=phone, username=username,
                                                 customer_id=onboarded["customer_id"])
    return onboarded["customer_id"], phone


def test_an_officer_asks_the_admin_decides_and_regulated_records_stay(customer):
    customer_id, phone = customer
    officer, oh = login("officer.mumbai")
    admin, ah = login("admin.kosh")
    assert officer.post(f"/api/officer/customers/{customer_id}/deletion-request", headers=oh, json={"reason": "short"}).status_code == 400
    asked = officer.post(f"/api/officer/customers/{customer_id}/deletion-request", headers=oh,
                         json={"reason": "Customer asked to close their digital access"})
    assert asked.status_code == 200, asked.text
    request_id = asked.json()["id"]
    assert officer.post(f"/api/officer/customers/{customer_id}/deletion-request", headers=oh,
                        json={"reason": "Customer asked to close their digital access"}).status_code == 409  # one at a time
    assert dev_ui.auth_service.profile_exists(phone)  # nothing removed by the request alone
    listed = next(c for c in officer.get("/api/officer/customers").json()["customers"] if c["customer_id"] == customer_id)
    assert listed["deletion_pending"] is True

    decide = f"/api/admin/deletions/{request_id}/decision"
    assert officer.post(decide, headers=oh, json={"decision": "APPROVE", "note": "self approval"}).status_code == 403
    with patch("backend.session_routes._auth_server", return_value=True) as sign_in_server:
        done = admin.post(decide, headers=ah, json={"decision": "APPROVE", "note": "Checked the request with the branch"})
    assert done.status_code == 200, done.text
    assert done.json()["result"]["removed"]["logins"] >= 1
    assert sign_in_server.call_args.args[0] == "wipe-user"
    assert admin.post(decide, headers=ah, json={"decision": "APPROVE", "note": "again, twice"}).status_code == 409

    assert not dev_ui.auth_service.profile_exists(phone)
    kept = db.get_customer(customer_id)
    assert kept is not None and kept["email"] is None and kept["phone_number"] is None
    assert db.get_accounts(customer_id)  # accounts and their history are kept
    assert officer.post(f"/api/officer/customers/{customer_id}/resend-credentials", headers=oh).status_code == 409
    audit = [e for e in db.get_audit_events(limit=50) if e["event_type"].startswith("CUSTOMER_")]
    assert {"CUSTOMER_DELETION_REQUESTED", "CUSTOMER_ACCESS_REMOVED"} <= {e["event_type"] for e in audit}
    recorded = json.dumps(audit)
    assert phone not in recorded and phone[-10:] not in recorded and customer_id not in recorded


def test_the_admin_can_reject_and_only_officers_can_ask(customer):
    customer_id, phone = customer
    officer, oh = login("officer.mumbai")
    admin, ah = login("admin.kosh")
    for other, h in (login("aarav"), (admin, ah)):
        assert other.post(f"/api/officer/customers/{customer_id}/deletion-request", headers=h,
                          json={"reason": "I want this customer gone now"}).status_code == 403
    request_id = officer.post(f"/api/officer/customers/{customer_id}/deletion-request", headers=oh,
                              json={"reason": "Duplicate profile created by mistake"}).json()["id"]
    rejected = admin.post(f"/api/admin/deletions/{request_id}/decision", headers=ah, json={"decision": "REJECT", "note": "Not a duplicate"})
    assert rejected.json()["status"] == "REJECTED"
    assert dev_ui.auth_service.profile_exists(phone)
    assert officer.delete(f"/api/officer/customers/{customer_id}").status_code in {404, 405}  # the one-person wipe is gone
