import pytest
from banking_db import db
from service_requests import ServiceRequestService
from rpa.rpa_runner import RPARunner
from rpa.models import AccountApplicationSnapshot, JobStatus
from rpa.job_dispatcher import get_job_queue


@pytest.mark.asyncio
async def test_full_chatbot_rpa_cbs_lifecycle(cbs_url):
    # 1. Customer submits account opening application via Sentinel Chatbot
    req_svc = ServiceRequestService(db)
    queue = get_job_queue()
    queue.clear()

    req = req_svc.create(
        customer_id="CUST-1001",
        user_id="aarav",
        service_id="P1-25",
        data={
            "full_name": "Aarav Mehta",
            "pan_number": "ABCDE1234F",
            "date_of_birth": "1990-05-15",
            "mobile": "9876543210",
            "email": "aarav.mehta@example.com",
            "address": "Flat 402 Sea Breeze Apts Bandra West",
            "city": "Mumbai",
            "pincode": "400050",
            "account_scheme": "SAVINGS_INDIVIDUAL",
        },
        consent_id="CONS-001",
        session_id="SESS-TEST-LIFECYCLE-01",
    )
    assert req["status"] == "PENDING_APPROVAL"

    # 2. Officer verifies and approves the request in the Maker-Checker queue
    decision = req_svc.decide(
        req["id"],
        officer_user_id="USR-OFFICER-001",
        action="APPROVE",
        reason="KYC documents, PAN, and address proof verified against bank policy.",
        verification_checks=["document_authenticity", "identity_match"],
    )
    assert decision["status"] == "QUEUED_FOR_CBS"
    assert queue.has_job(req["id"]) is True

    # 3. RPA Agent leases the job and executes Playwright automation against CBS (Maker role)
    job = queue.get_job(req["id"])
    assert job is not None

    snapshot = AccountApplicationSnapshot(
        application_reference=req["id"],
        customer_name=job["payload"]["full_name"],
        pan=job["payload"]["pan_number"],
        aadhaar_last4="9812",
        dob=job["payload"]["date_of_birth"],
        mobile=job["payload"]["mobile"],
        email=job["payload"]["email"],
        address_line=job["payload"]["address"],
        city=job["payload"]["city"],
        pincode=job["payload"]["pincode"],
        account_type=job["payload"]["account_scheme"],
    )

    runner = RPARunner(cbs_base_url=cbs_url, headless=True)
    rpa_result = await runner.run_account_opening(snapshot)

    assert rpa_result["status"] == JobStatus.COMPLETED
    assert rpa_result["cif_number"].startswith("CIF-")
    assert rpa_result["account_number"].startswith("1092")
    assert rpa_result["read_back_verified"] is True
    assert rpa_result["maker_service_account"] == "RPA-AO-01"

    # 4. Update job in queue with generated CBS details
    queue.update_job(
        req["id"],
        status=JobStatus.COMPLETED.value,
        cif_number=rpa_result["cif_number"],
        account_number=rpa_result["account_number"],
    )

    completed_job = queue.get_job(req["id"])
    assert completed_job["status"] == "COMPLETED"
    assert completed_job["cif_number"] == rpa_result["cif_number"]
    assert completed_job["account_number"] == rpa_result["account_number"]

    req_svc.apply_rpa_result(req["id"], rpa_result)
    completed_request = req_svc.get(req["id"])
    assert completed_request["status"] == "COMPLETED"
    assert completed_request["collected_data"]["cif_number"] == rpa_result["cif_number"]
    matching_accounts = [account for account in db.get_accounts("CUST-1001")
                         if account.get("source_request_id") == req["id"]]
    assert len(matching_accounts) == 1
    assert matching_accounts[0]["status"] == "PENDING_ACTIVATION"
