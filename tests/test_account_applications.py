"""Account applications: one pipeline from submission through officer review and the core-banking robot to an open account."""
import random
from datetime import timedelta

import pytest

from account_applications import AccountApplicationService, ApplicationError, KYC_CHECKS
from banking_db import db
from persistence import AccountApplicationRecord, UserRecord, utc_dt

OFFICER = "USR-OFFICER-APPS"
SAVINGS = {"full_name": "Riya Shah", "date_of_birth": "1994-08-14", "pan_number": "ABCPS1234K", "address": "12 Lake Road",
           "city": "Pune", "state": "Maharashtra", "pincode": "411001", "email": "riya@example.com"}


def _mobile():
    return f"9{random.randint(100000000, 999999999)}"


@pytest.fixture
def svc():
    db.reset_to_seed()
    db.update_kyc_status("CUST-1001", "VERIFIED")
    with db.runtime.sessions.begin() as s:
        if not s.get(UserRecord, OFFICER):
            s.add(UserRecord(id=OFFICER, username="officer.apps", display_name="Apps Officer", role="OFFICER", active=True))
    queued = []
    service = AccountApplicationService(db, on_queued=queued.append)
    service.queued = queued
    return service


def _approve(svc, ref):
    return svc.decide(ref, officer_user_id=OFFICER, action="APPROVE", reason="Documents and details verified",
                      kyc_checks=sorted(KYC_CHECKS), kyc_reference="KYC-VER-20261009")


def test_new_to_bank_savings_waits_for_review_and_the_form_is_encrypted(svc):
    mobile = _mobile()
    app = svc.submit(product_id="PROD-SAV-PREMIER", mobile=mobile, payload=SAVINGS)
    assert app["status"] == "SUBMITTED" and app["track"] == "NEW_TO_BANK" and app["reference"].startswith("SAV-APP-")
    assert svc.queued == []
    with db.runtime.sessions() as s:
        raw = s.get(AccountApplicationRecord, app["reference"])
        assert "ABCPS1234K" not in raw.payload_sealed and mobile not in raw.mobile_token
    assert svc.payload(app["reference"])["pan_number"] == "ABCPS1234K"
    status = svc.applicant_status(app["reference"], "+91 " + mobile)
    assert status["status"] == "UNDER_REVIEW"
    assert svc.applicant_status(app["reference"], _mobile()) is None  # wrong mobile looks like an unknown reference


def test_only_savings_and_fixed_deposits(svc):
    with pytest.raises(ApplicationError, match="savings accounts and fixed deposits"):
        svc.submit(product_id="PROD-CARD-CASHBACK", mobile=_mobile(), payload={})


def test_a_second_open_application_of_the_same_kind_is_refused(svc):
    mobile = _mobile()
    svc.submit(product_id="PROD-SAV-PREMIER", mobile=mobile, payload=SAVINGS)
    with pytest.raises(ApplicationError, match="already have an application"):
        svc.submit(product_id="PROD-SAV-DIGITAL", mobile=mobile, payload=SAVINGS)


def test_fixed_deposit_is_for_verified_customers_with_their_own_funding_account(svc):
    fd = {"funding_account_id": "ACC-SAL-001", "amount_minor": 1_000_000, "tenure_months": 12}
    with pytest.raises(ApplicationError, match="savings account first"):
        svc.submit(product_id="PROD-FD-SMART", mobile=_mobile(), payload=fd)
    with pytest.raises(ApplicationError, match="active savings accounts"):
        svc.submit(product_id="PROD-FD-SMART", mobile=_mobile(), payload={**fd, "funding_account_id": "ACC-NOT-MINE"},
                   customer_id="CUST-1001", user_id="USR-AARAV")
    with pytest.raises(ApplicationError, match="enough available balance"):
        svc.submit(product_id="PROD-FD-SMART", mobile=_mobile(), payload={**fd, "amount_minor": 10**12},
                   customer_id="CUST-1001", user_id="USR-AARAV")
    db.update_kyc_status("CUST-1001", "PENDING_RE_KYC")
    with pytest.raises(ApplicationError, match="KYC"):
        svc.submit(product_id="PROD-FD-SMART", mobile=_mobile(), payload=fd, customer_id="CUST-1001", user_id="USR-AARAV")
    db.update_kyc_status("CUST-1001", "VERIFIED")
    app = svc.submit(product_id="PROD-FD-SMART", mobile=_mobile(), payload=fd, customer_id="CUST-1001", user_id="USR-AARAV")
    assert app["status"] == "QUEUED_FOR_CBS" and app["reference"].startswith("FD-APP-")  # no officer review
    assert svc.queued == [app["reference"]]


def test_officer_decision_needs_a_reason_and_kyc_comes_first(svc):
    ref = svc.submit(product_id="PROD-SAV-PREMIER", mobile=_mobile(), payload=SAVINGS)["reference"]
    with pytest.raises(ApplicationError, match="reason"):
        svc.decide(ref, officer_user_id=OFFICER, action="REJECT", reason="no")
    with pytest.raises(ApplicationError, match="KYC comes first"):
        svc.decide(ref, officer_user_id=OFFICER, action="APPROVE", reason="Documents and details verified")
    approved = _approve(svc, ref)
    assert approved["status"] == "QUEUED_FOR_CBS" and approved["kyc_verification"]["reference"] == "KYC-VER-20261009"
    assert svc.queued == [ref]
    with pytest.raises(ApplicationError, match="cannot be approved"):
        _approve(svc, ref)


def test_existing_verified_customer_savings_needs_no_kyc_checks_but_four_eyes_holds(svc):
    ref = svc.submit(product_id="PROD-SAV-DIGITAL", mobile=_mobile(), payload=SAVINGS, customer_id="CUST-1001",
                     user_id="USR-AARAV")["reference"]
    with db.runtime.sessions.begin() as s:
        if not s.get(UserRecord, "USR-OFFICER-OWN"):
            s.add(UserRecord(id="USR-OFFICER-OWN", username="officer.own", display_name="Own", role="OFFICER",
                             customer_id="CUST-1001", active=True))
    with pytest.raises(ApplicationError, match="Four-eyes"):
        svc.decide(ref, officer_user_id="USR-OFFICER-OWN", action="APPROVE", reason="Looks complete and correct")
    assert svc.decide(ref, officer_user_id=OFFICER, action="APPROVE", reason="Looks complete and correct")["status"] == "QUEUED_FOR_CBS"


def test_rejection_shows_the_reason_and_allows_applying_again(svc):
    mobile = _mobile()
    ref = svc.submit(product_id="PROD-SAV-PREMIER", mobile=mobile, payload=SAVINGS)["reference"]
    svc.decide(ref, officer_user_id=OFFICER, action="REJECT", reason="The address proof is not readable; upload a clear copy")
    status = svc.applicant_status(ref, mobile)
    assert status["status"] == "NOT_APPROVED" and "address proof" in status["reason"] and status["can_apply_again"]
    prefill = svc.prefill_for_reapply(ref, mobile)
    assert prefill["fields"]["pan_number"] == "ABCPS1234K"
    again = svc.submit(product_id=prefill["product_id"], mobile=mobile, payload=prefill["fields"], reapplied_from=ref)
    assert again["status"] == "SUBMITTED" and again["reapplied_from"] == ref
    with pytest.raises(ApplicationError, match="Only a rejected"):
        svc.prefill_for_reapply(again["reference"], mobile)


def test_the_robot_path_to_an_open_account(svc):
    mobile = _mobile()
    ref = svc.submit(product_id="PROD-SAV-PREMIER", mobile=mobile, payload=SAVINGS)["reference"]
    _approve(svc, ref)
    assert svc.claim(ref) is True
    assert svc.claim(ref) is False  # only one instance keys it into the core
    with pytest.raises(ApplicationError, match="cannot go from RPA_EXECUTING to CBS_AUTHORISED"):
        svc.authorised(ref, checker_reference="CHK-1", cif_number="CIF-9", account_number="1092009999")
    svc.maker_done(ref, maker_reference="MKR-1", cif_number="CIF-9")
    assert svc.applicant_status(ref, mobile)["status"] == "APPROVED"  # being set up
    svc.authorised(ref, checker_reference="CHK-1", cif_number="CIF-9", account_number="1092009999")
    opened = svc.opened(ref, customer_id="CUST-NEW-9")
    assert opened["status"] == "OPENED" and opened["customer_id"] == "CUST-NEW-9"
    assert opened["cbs"] == {"maker_reference": "MKR-1", "cif_number": "CIF-9", "checker_reference": "CHK-1",
                             "account_number": "1092009999"}
    status = svc.applicant_status(ref, mobile)
    assert status["status"] == "OPENED" and status["account_number_masked"] == "•••• 9999"
    assert [h["to"] for h in opened["history"]] == ["SUBMITTED", "QUEUED_FOR_CBS", "RPA_EXECUTING", "CBS_MAKER_DONE",
                                                   "CBS_AUTHORISED", "OPENED"]
    events = [e for e in db.get_audit_events(limit=60) if e.get("approval_request_id") == ref]
    assert {e["event_type"] for e in events} >= {"ACCOUNT_APPLICATION_SUBMITTED", "ACCOUNT_APPLICATION_OPENED"}


def test_robot_failure_is_hidden_from_the_applicant_and_an_officer_retries_or_rejects(svc):
    mobile = _mobile()
    ref = svc.submit(product_id="PROD-SAV-PREMIER", mobile=mobile, payload=SAVINGS)["reference"]
    _approve(svc, ref)
    svc.claim(ref)
    failed = svc.failed(ref, error="Timeout waiting for txtPanNo")
    assert failed["status"] == "RPA_FAILED" and failed["rpa"]["last_error"].startswith("Timeout")
    status = svc.applicant_status(ref, mobile)
    assert status["status"] == "APPROVED" and "Timeout" not in str(status)
    assert svc.retry(ref, officer_user_id=OFFICER)["status"] == "QUEUED_FOR_CBS"
    svc.claim(ref)
    svc.failed(ref, error="Duplicate PAN in the core", refused_by_core=True)
    rejected = svc.decide(ref, officer_user_id=OFFICER, action="REJECT", reason="A customer with this PAN already exists")
    assert rejected["status"] == "REJECTED" and rejected["rpa"]["attempts"] == 2


def test_requeue_after_restart(svc):
    ref = svc.submit(product_id="PROD-SAV-PREMIER", mobile=_mobile(), payload=SAVINGS)["reference"]
    _approve(svc, ref)
    svc.claim(ref)
    assert ref not in svc.requeue_stale()  # still running somewhere
    with db.runtime.sessions.begin() as s:
        s.get(AccountApplicationRecord, ref).updated_at = utc_dt() - timedelta(minutes=30)
    svc.queued.clear()
    assert ref in svc.requeue_stale() and ref in svc.queued
    assert svc.get(ref)["status"] == "QUEUED_FOR_CBS"
