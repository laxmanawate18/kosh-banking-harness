"""Applying: a visitor's savings application with KYC documents, tracking it, applying again after a rejection, and a
signed-in customer's savings account or fixed deposit (identity verified first)."""
import base64
import io
import random
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import dev_ui
from account_applications import KYC_CHECKS

PAN = "ABCPS4412K"


def _png() -> str:
    out = io.BytesIO()
    Image.new("RGB", (60, 40), (200, 200, 200)).save(out, format="PNG")
    return base64.b64encode(out.getvalue()).decode()


def _ocr(raw, mime, pages):  # the bank's OCR, stubbed: a PAN card and an Aadhaar that match the form
    return {"status": "TEXT_EXTRACTED", "text": f"INCOME TAX DEPARTMENT\nName\nRIYA SHAH\nDate of Birth 14/08/1994\n{PAN}\n"
                                                "Address: 12 Lake Road, Pune 411001\nXXXX XXXX 9012"}


def _form(mobile, **changes):
    return {"full_name": "Riya Shah", "date_of_birth": "1994-08-14", "mobile": mobile, "email": "riya@example.com",
            "pan_number": PAN, "address": "12 Lake Road", "city": "Pune", "state": "Maharashtra", "pincode": "411001",
            "document_last4": "9012", "nominee_name": "Asha Shah", "nominee_relationship": "MOTHER",
            "declarations_accepted": True, **changes}


DOCS = [{"document_type": "PAN", "mime_type": "image/png", "content_base64": _png()},
        {"document_type": "AADHAAR", "mime_type": "image/png", "content_base64": _png()}]


@pytest.fixture(autouse=True)
def setup():
    dev_ui.limiter.reset()
    with patch("document_processing.CloudDocumentScanner.scan", side_effect=_ocr):
        yield


def _mobile():
    return f"9{random.randint(100000000, 999999999)}"


def _apply(client, mobile, **body):
    return client.post("/api/applications/account", json={"product_id": "PROD-SAV-PREMIER", "fields": _form(mobile),
                                                           "documents": DOCS, **body})


def _officer():
    client = TestClient(dev_ui.app)
    _, cookie, csrf = dev_ui.auth_service.create_direct_session("officer.mumbai")
    client.cookies.set(dev_ui.COOKIE_NAME, cookie)
    return client, {"X-CSRF-Token": csrf}


def test_visitor_applies_with_kyc_documents_and_the_officer_sees_the_checks():
    mobile, visitor = _mobile(), TestClient(dev_ui.app)
    reply = _apply(visitor, mobile)
    assert reply.status_code == 201, reply.text
    ref = reply.json()["reference"]
    assert reply.json()["status"] == "UNDER_REVIEW" and ref.startswith("SAV-APP-") and PAN not in reply.text
    officer, _ = _officer()
    detail = officer.get(f"/api/officer/applications/{ref}").json()
    checks = {f["code"]: f["status"] for f in detail["findings"]}
    assert {"PAN_NUMBER": "PASS", "PAN_NAME": "PASS", "AADHAAR_PINCODE": "PASS"}.items() <= checks.items()
    assert PAN not in str(detail["findings"]) and [d["document_type"] for d in detail["documents"]] == ["PAN", "AADHAAR"]
    image = officer.get(f"/api/officer/applications/{ref}/documents/{detail['documents'][0]['id']}")
    assert image.status_code == 200 and image.headers["content-type"] == "image/jpeg" and image.content[:2] == b"\xff\xd8"
    assert any(e["event_type"] == "APPLICATION_DOCUMENT_VIEWED" for e in dev_ui.db.get_audit_events(limit=10))
    assert visitor.get(f"/api/officer/applications/{ref}/documents/{detail['documents'][0]['id']}").status_code in (401, 403)


def test_a_mismatch_is_flagged_for_the_officer_not_refused():
    reply = TestClient(dev_ui.app).post("/api/applications/account", json={
        "product_id": "PROD-SAV-PREMIER", "fields": _form(_mobile(), pan_number="ABCPS9999K"), "documents": DOCS})
    assert reply.status_code == 201
    detail = _officer()[0].get(f"/api/officer/applications/{reply.json()['reference']}").json()
    assert next(f for f in detail["findings"] if f["code"] == "PAN_NUMBER")["status"] == "OFFICER_REVIEW"


@pytest.mark.parametrize("changes,documents,message", [
    ({}, DOCS[:1], "address proof"),
    ({"date_of_birth": "2015-01-01"}, DOCS, "18 or older"),
    ({"address": "12 Lake Road; DROP TABLE"}, DOCS, "address"),
    ({"declarations_accepted": False}, DOCS, "declarations"),
    ({"state": "Atlantis"}, DOCS, "state"),
])
def test_the_form_is_checked_before_anything_is_stored(changes, documents, message):
    reply = TestClient(dev_ui.app).post("/api/applications/account", json={
        "product_id": "PROD-SAV-PREMIER", "fields": _form(_mobile(), **changes), "documents": documents})
    assert reply.status_code == 422 and message in reply.json()["detail"]


def test_only_savings_and_existing_customers_sign_in_instead():
    visitor = TestClient(dev_ui.app)
    assert visitor.post("/api/applications/account", json={"product_id": "PROD-CARD-CASHBACK", "fields": _form(_mobile()),
                                                           "documents": DOCS}).status_code == 422
    assert dev_ui.auth_service.profile_exists("+919876543210")  # Aarav already banks with Kosh
    assert _apply(visitor, "9876543210").status_code == 409


def test_track_reject_and_apply_again():
    mobile, visitor = _mobile(), TestClient(dev_ui.app)
    ref = _apply(visitor, mobile).json()["reference"]
    tracked = visitor.post("/api/applications/status", json={"reference": ref, "mobile": mobile})
    assert tracked.json()["status"] == "UNDER_REVIEW"
    officer, h = _officer()
    officer.post(f"/api/officer/applications/{ref}/decision", headers=h,
                 json={"action": "REJECT", "reason": "The address proof photo is blurred; upload a clear copy"})
    tracked = visitor.post("/api/applications/status", json={"reference": ref, "mobile": mobile}).json()
    assert tracked["status"] == "NOT_APPROVED" and "blurred" in tracked["reason"] and tracked["can_apply_again"]
    prefill = visitor.post("/api/applications/prefill", json={"reference": ref, "mobile": mobile}).json()
    assert prefill["fields"]["full_name"] == "Riya Shah" and "pan_number" not in prefill["fields"]
    assert "date_of_birth" not in prefill["fields"]
    assert visitor.post("/api/applications/prefill", json={"reference": ref, "mobile": _mobile()}).status_code == 404
    again = _apply(visitor, mobile, reapplied_from=ref)
    assert again.status_code == 201 and again.json()["reference"] != ref
    assert _apply(TestClient(dev_ui.app), _mobile(), reapplied_from=ref).status_code == 422  # not this mobile's


def _customer():
    """Aarav signed in, with no application left over from an earlier run (the duplicate guard would refuse a new one)."""
    from sqlalchemy import delete
    from persistence import AccountApplicationRecord
    with dev_ui.db.runtime.sessions.begin() as session:
        session.execute(delete(AccountApplicationRecord).where(AccountApplicationRecord.customer_id == "CUST-1001"))
    client = TestClient(dev_ui.app)
    dev_ui.auth_service.capture_consent("CUST-1001")
    _, cookie, csrf = dev_ui.auth_service.create_direct_session("aarav")
    client.cookies.set(dev_ui.COOKIE_NAME, cookie)
    return client, {"X-CSRF-Token": csrf}, cookie


def test_customer_books_a_deposit_after_verifying_identity():
    dev_ui.db.reset_to_seed()
    dev_ui.db.update_kyc_status("CUST-1001", "VERIFIED")
    client, h, cookie = _customer()
    body = {"funding_account_id": "ACC-SAL-001", "amount_minor": 2_500_000, "tenure_months": 12,
            "maturity_instruction": "RENEW_PRINCIPAL"}
    refused = client.post("/api/customer/applications/deposit", headers=h, json=body)
    assert refused.status_code == 403 and refused.json()["detail"]["code"] == "STEP_UP_REQUIRED"
    dev_ui.auth_service.elevate_session(cookie, "L3")
    booked = client.post("/api/customer/applications/deposit", headers=h, json=body)
    assert booked.status_code == 201, booked.text
    assert booked.json()["reference"].startswith("FD-APP-")
    assert booked.json()["status_code"] == "QUEUED_FOR_CBS"  # no officer review for a verified customer's FD
    mine = client.get("/api/customer/applications").json()["applications"]
    assert any(a["reference"] == booked.json()["reference"] for a in mine)
    assert client.post("/api/customer/applications/deposit", headers=h, json={**body, "tenure_months": 2}).status_code == 422


def test_customer_opens_another_savings_account_only_with_kyc_done():
    dev_ui.db.reset_to_seed()
    client, h, cookie = _customer()
    dev_ui.auth_service.elevate_session(cookie, "L3")
    dev_ui.db.update_kyc_status("CUST-1001", "PENDING_RE_KYC")
    assert "KYC comes first" in client.post("/api/customer/applications/account", headers=h,
                                            json={"product_id": "PROD-SAV-DIGITAL"}).json()["detail"]
    dev_ui.db.update_kyc_status("CUST-1001", "VERIFIED")
    opened = client.post("/api/customer/applications/account", headers=h,
                         json={"product_id": "PROD-SAV-DIGITAL", "nominee_name": "Meera Mehta", "nominee_relationship": "SPOUSE"})
    assert opened.status_code == 201, opened.text
    assert opened.json()["status"] == "UNDER_REVIEW"
    officer, oh = _officer()
    approved = officer.post(f"/api/officer/applications/{opened.json()['reference']}/decision", headers=oh,
                            json={"action": "APPROVE", "reason": "Existing verified customer, nominee details checked"})
    assert approved.json()["status"] == "QUEUED_FOR_CBS"  # KYC already verified: no KYC checks needed
    assert not set(KYC_CHECKS) & set(approved.json().get("kyc_checks", []))


def test_a_new_customer_activates_online_banking_once():
    mobile, visitor = _mobile(), TestClient(dev_ui.app)
    ref = _apply(visitor, mobile).json()["reference"]
    officer, h = _officer()
    officer.post(f"/api/officer/applications/{ref}/decision", headers=h, json={
        "action": "APPROVE", "reason": "Documents and details verified", "kyc_checks": sorted(KYC_CHECKS),
        "kyc_reference": "KYC-VER-20261009"})
    svc, customer_id = dev_ui.account_applications, f"CUST-T{random.randint(10000, 99999)}"
    svc.claim(ref)
    svc.maker_done(ref, maker_reference="MKR-1", cif_number="CIF-9")
    svc.authorised(ref, checker_reference="CHK-1", cif_number="CIF-9", account_number="1092009999")
    svc.opened(ref, customer_id=customer_id)  # the user id is created here, with no password
    status = visitor.post("/api/applications/status", json={"reference": ref, "mobile": mobile}).json()
    user_id = status["user_id"]
    assert user_id.startswith("riya") and status["online_banking_active"] is False
    body = {"reference": ref, "user_id": user_id, "date_of_birth": "1994-08-14", "password": "Kosh-demo-2026"}
    with patch("backend.session_routes._auth_server", return_value=True) as auth_server:
        assert visitor.post("/api/applications/activate", json={**body, "password": "short"}).status_code == 422
        assert visitor.post("/api/applications/activate", json={**body, "date_of_birth": "1990-01-01"}).status_code == 400
        assert not auth_server.called
        done = visitor.post("/api/applications/activate", json=body)
        assert done.status_code == 200, done.text
        sent = auth_server.call_args.args[1]
        assert auth_server.call_args.args[0] == "provision-user"
        assert sent["username"] == user_id and sent["sentinelUserId"] == customer_id and sent["phoneNumber"] == "+91" + mobile
        dev_ui.limiter.reset()
        assert "already active" in visitor.post("/api/applications/activate", json=body).json()["detail"]
    assert visitor.post("/api/applications/status", json={"reference": ref, "mobile": mobile}).json()["online_banking_active"]


def test_activation_locks_after_five_wrong_tries():
    ref = _apply(TestClient(dev_ui.app), _mobile()).json()["reference"]
    svc = dev_ui.account_applications
    officer, h = _officer()
    officer.post(f"/api/officer/applications/{ref}/decision", headers=h, json={
        "action": "APPROVE", "reason": "Documents and details verified", "kyc_checks": sorted(KYC_CHECKS),
        "kyc_reference": "KYC-VER-20261009"})
    svc.claim(ref)
    svc.maker_done(ref, maker_reference="MKR-2", cif_number="CIF-8")
    svc.authorised(ref, checker_reference="CHK-2", cif_number="CIF-8", account_number="1092008888")
    user_id = svc.opened(ref, customer_id=f"CUST-T{random.randint(10000, 99999)}")["activation"]["username"]
    from account_applications import ApplicationError
    for _ in range(4):
        with pytest.raises(ApplicationError, match="do not match"):
            svc.check_activation(ref, user_id, "2000-01-01")
    with pytest.raises(ApplicationError, match="30 minutes"):
        svc.check_activation(ref, user_id, "2000-01-01")
    with pytest.raises(ApplicationError, match="30 minutes"):  # even with the right details, until the lock expires
        svc.check_activation(ref, user_id, "1994-08-14")
