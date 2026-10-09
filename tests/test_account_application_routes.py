"""Officer review API for account applications: officers only, the queue views, an audited detail view, decisions."""
import random

from fastapi.testclient import TestClient

import dev_ui
from account_applications import KYC_CHECKS

FORM = {"full_name": "Riya Shah", "date_of_birth": "1994-08-14", "pan_number": "ABCPS1234K", "address": "12 Lake Road",
        "city": "Pune", "state": "Maharashtra", "pincode": "411001", "email": "riya@example.com"}


def _client(username):
    client = TestClient(dev_ui.app)
    _, cookie, csrf = dev_ui.auth_service.create_direct_session(username)
    client.cookies.set(dev_ui.COOKIE_NAME, cookie)
    return client, {"X-CSRF-Token": csrf}


def _submitted():
    mobile = f"9{random.randint(100000000, 999999999)}"
    ref = dev_ui.account_applications.submit(product_id="PROD-SAV-PREMIER", mobile=mobile, payload={**FORM, "mobile": mobile})["reference"]
    return ref, mobile


def setup_function():
    dev_ui.limiter.reset()


def test_officers_only():
    ref, _ = _submitted()
    customer, h = _client("aarav")
    assert customer.get("/api/officer/applications").status_code == 403
    assert customer.post(f"/api/officer/applications/{ref}/decision", headers=h,
                         json={"action": "REJECT", "reason": "Not allowed here at all"}).status_code == 403
    officer, _ = _client("officer.mumbai")
    assert officer.post(f"/api/officer/applications/{ref}/decision",  # no CSRF token
                        json={"action": "REJECT", "reason": "Missing the CSRF header"}).status_code in (401, 403)


def test_queue_detail_and_decisions():
    ref, mobile = _submitted()
    officer, h = _client("officer.mumbai")
    queue = officer.get("/api/officer/applications", params={"view": "review"}).json()
    row = next(a for a in queue["applications"] if a["reference"] == ref)
    assert row["applicant"] == "Riya Shah" and row["kyc_required"] and row["mobile_masked"] == f"••••••{mobile[-4:]}"
    assert row["product"] == "Kosh Suvarna Premier Savings" and queue["counts"]["review"] >= 1
    detail = officer.get(f"/api/officer/applications/{ref}").json()
    assert detail["payload"]["pan_number"] == "ABCPS1234K" and detail["history"][0]["to"] == "SUBMITTED"
    viewed = [e for e in dev_ui.db.get_audit_events(limit=30) if e["event_type"] == "ACCOUNT_APPLICATION_VIEWED"]
    assert any(e.get("approval_request_id") == ref for e in viewed)
    refused = officer.post(f"/api/officer/applications/{ref}/decision", headers=h,
                           json={"action": "APPROVE", "reason": "Documents and details verified"})
    assert refused.status_code == 400 and "KYC comes first" in refused.json()["detail"]
    approved = officer.post(f"/api/officer/applications/{ref}/decision", headers=h, json={
        "action": "APPROVE", "reason": "Documents and details verified", "kyc_checks": sorted(KYC_CHECKS),
        "kyc_reference": "KYC-VER-API-001"}).json()
    assert approved["status"] == "QUEUED_FOR_CBS"
    assert any(a["reference"] == ref for a in officer.get("/api/officer/applications", params={"view": "core"}).json()["applications"])
    assert officer.post(f"/api/officer/applications/{ref}/retry", headers=h).status_code == 400  # nothing failed
    robot = officer.get(f"/api/officer/applications/{ref}/robot").json()
    assert robot["status"] == "QUEUED_FOR_CBS" and robot["events"] == []


def test_rejection_reason_reaches_the_applicant():
    ref, mobile = _submitted()
    officer, h = _client("officer.mumbai")
    short = officer.post(f"/api/officer/applications/{ref}/decision", headers=h, json={"action": "REJECT", "reason": "no"})
    assert short.status_code == 422
    rejected = officer.post(f"/api/officer/applications/{ref}/decision", headers=h,
                            json={"action": "REJECT", "reason": "The PAN on the form does not match the uploaded PAN card"}).json()
    assert rejected["status"] == "REJECTED"
    status = dev_ui.account_applications.applicant_status(ref, mobile)
    assert "does not match" in status["reason"]
    assert officer.get("/api/officer/applications", params={"view": "bogus"}).status_code == 422
