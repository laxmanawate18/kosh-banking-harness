from banking_db import db
from service_requests import ServiceRequestService
from rpa.job_dispatcher import get_job_queue


def test_officer_approving_account_opening_enqueues_rpa_job():
    req_svc = ServiceRequestService(db)
    queue = get_job_queue()
    queue.clear()

    # Create dummy account opening request
    req = req_svc.create(
        customer_id="CUST-1001",
        user_id="aarav",
        service_id="P1-25",
        data={
            "full_name": "Aarav Mehta",
            "pan_number": "ABCDE1234F",
            "date_of_birth": "1990-05-15",
            "mobile": "9876543210",
            "email": "aarav@example.com",
            "address": "Flat 402 Sea Breeze Apts",
            "city": "Mumbai",
            "pincode": "400050",
            "account_scheme": "SAVINGS_INDIVIDUAL",
        },
        consent_id="CONS-001",
        session_id="SESS-001",
    )

    # Officer approves the request
    decision = req_svc.decide(
        req["id"],
        officer_user_id="USR-OFFICER-001",
        action="APPROVE",
        reason="KYC documents and declarations verified against CBS rules.",
        verification_checks=["document_authenticity", "identity_match"],
    )

    assert decision["status"] == "QUEUED_FOR_CBS"
    assert decision["collected_data"].get("cif_number") is None
    assert decision["rpa_job"]["status"] == "PENDING"
    assert "payload" not in decision["rpa_job"]
    # Verify job is enqueued in the dispatcher queue
    assert queue.has_job(req["id"]) is True
