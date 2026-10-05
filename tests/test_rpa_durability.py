"""Core-banking automation survives restarts and never runs twice: the database, not process memory, decides."""
from datetime import timedelta

from banking_db import db
from persistence import ServiceRequestRecord, utc_dt
from rpa.job_dispatcher import get_job_queue
from service_requests import ServiceRequestService


def _approved_account_opening(svc):
    req = svc.create(customer_id="CUST-1001", user_id="aarav", service_id="P1-25", consent_id="C-RPA", session_id="S-RPA",
                     data={"full_name": "Aarav Mehta", "pan_number": "ABCDE1234F", "date_of_birth": "1990-05-15",
                           "mobile": "9876543210", "email": "a@example.com", "address": "Flat 402", "city": "Mumbai",
                           "pincode": "400050", "account_scheme": "SAVINGS_INDIVIDUAL"})
    svc.decide(req["id"], officer_user_id="USR-OFFICER-001", action="APPROVE", reason="Verified against CBS rules.",
               verification_checks=["document_authenticity", "identity_match"])
    return req["id"]


def test_only_one_instance_can_claim_a_request():
    svc = ServiceRequestService(db)
    get_job_queue().clear()
    request_id = _approved_account_opening(svc)
    assert svc.claim_for_rpa(request_id) is True
    assert svc.claim_for_rpa(request_id) is False  # a second instance (or a duplicate queue entry) skips it
    assert svc.get(request_id)["status"] == "RPA_EXECUTING"


def test_restart_requeues_unfinished_and_stale_runs_but_not_live_ones():
    svc = ServiceRequestService(db)
    get_job_queue().clear()
    never_ran = _approved_account_opening(svc)
    live = _approved_account_opening(svc)
    stale = _approved_account_opening(svc)
    svc.claim_for_rpa(live)
    svc.claim_for_rpa(stale)
    with db.runtime.sessions.begin() as s:
        s.get(ServiceRequestRecord, stale).updated_at = utc_dt() - timedelta(hours=1)  # its instance died mid-run
    get_job_queue().clear()  # a restart loses the in-memory queue
    requeued = svc.requeue_rpa()
    assert never_ran in requeued and stale in requeued and live not in requeued
    assert get_job_queue().has_job(never_ran) and not get_job_queue().has_job(live)
    get_job_queue().clear()
