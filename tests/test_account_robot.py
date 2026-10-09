"""The account-opening robot end to end: a queued application is keyed into the legacy core's screens by the maker,
authorised by the core's checker, read back, mirrored in Kosh and marked opened. Real browser, real legacy screens."""
import random
import socket

import pytest
import requests

from account_applications import AccountApplicationService, KYC_CHECKS, link_existing_customers
from banking_db import db
from persistence import UserRecord
from rpa.account_worker import AccountRobotWorker

OFFICER = "USR-OFFICER-ROBOT"


@pytest.fixture(scope="module")
def core_url(tmp_path_factory):
    import os
    os.environ["LEGACY_CBS_DATABASE_URL"] = f"sqlite+pysqlite:///{tmp_path_factory.mktemp('core') / 'legacy.sqlite3'}"
    from legacy_cbs import server
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        server.PORT = probe.getsockname()[1]
    return server.start_in_background()


@pytest.fixture
def svc(core_url):
    db.reset_to_seed()
    db.update_kyc_status("CUST-1001", "VERIFIED")
    with db.runtime.sessions.begin() as s:
        if not s.get(UserRecord, OFFICER):
            s.add(UserRecord(id=OFFICER, username="officer.robot", display_name="Robot Officer", role="OFFICER", active=True))
    service = AccountApplicationService(db)
    service.worker = AccountRobotWorker(service, db, core_url)
    return service


def _applicant(pan=None):
    mobile = f"9{random.randint(100000000, 999999999)}"
    return mobile, {"full_name": "Riya Shah", "date_of_birth": "1994-08-14", "mobile": mobile, "email": "riya@example.com",
                    "pan_number": pan or f"ABC{random.choice('PQRST')}{random.choice('PQRST')}{random.randint(1000, 9999)}K",
                    "address": "12 Lake Road", "city": "Pune", "state": "Maharashtra", "pincode": "411001",
                    "nominee_name": "Asha Shah", "nominee_relationship": "MOTHER", "document_last4": "9012"}


def _approved(svc, payload, mobile, **extra):
    ref = svc.submit(product_id="PROD-SAV-PREMIER", mobile=mobile, payload=payload, **extra)["reference"]
    svc.decide(ref, officer_user_id=OFFICER, action="APPROVE", reason="Documents and details verified",
               kyc_checks=sorted(KYC_CHECKS), kyc_reference="KYC-VER-ROBOT-1")
    return ref


def test_new_to_bank_savings_is_keyed_authorised_and_mirrored(svc):
    mobile, payload = _applicant()
    ref = _approved(svc, payload, mobile)
    done = svc.worker.process(ref)
    assert done["status"] == "OPENED", done
    assert done["cbs"]["cif_number"].startswith("CIF") and done["cbs"]["account_number"].startswith("1092")
    assert done["cbs"]["checker_reference"].startswith("AUTH")
    assert [h["to"] for h in done["history"]][-4:] == ["RPA_EXECUTING", "CBS_MAKER_DONE", "CBS_AUTHORISED", "OPENED"]
    customer = db.snapshot()["customers"][done["customer_id"]]
    assert customer["cif_number"] == done["cbs"]["cif_number"] and customer["kyc"]["status"] == "VERIFIED"
    assert customer["kyc"]["pan_masked"].endswith(payload["pan_number"][-4:]) and payload["pan_number"] not in str(customer)
    account = next(a for a in db.snapshot()["accounts"].values() if a.get("source_application") == ref)
    assert account["cbs_account_number"] == done["cbs"]["account_number"] and account["is_primary"] and account["status"] == "ACTIVE"
    steps = [e["step"] for e in done["rpa"]["events"]]
    assert steps[:2] == ["SIGN_IN_MAKER", "ENQUIRY"] and "NEW_CUSTOMER" in steps and steps[-1] == "AUTHORISE"
    assert all("screenshot" not in e for e in done["rpa"]["events"]) and svc.worker.latest_screenshot[ref].startswith("data:image/jpeg")
    assert svc.applicant_status(ref, mobile)["status"] == "OPENED"
    assert svc.worker.process(ref) is None  # already done: nothing to claim


def test_existing_customer_savings_goes_under_their_cif(svc):
    mobile, payload = _applicant()
    ref = _approved(svc, payload, mobile, customer_id="CUST-1001", user_id="USR-AARAV")
    done = svc.worker.process(ref)
    assert done["status"] == "OPENED" and done["customer_id"] == "CUST-1001" and done["cbs"]["cif_number"] == "CIF0001001"
    assert "NEW_CUSTOMER" not in [e["step"] for e in done["rpa"]["events"]]
    account = next(a for a in db.snapshot()["accounts"].values() if a.get("source_application") == ref)
    assert account["customer_id"] == "CUST-1001" and not account["is_primary"]


def test_fixed_deposit_debits_the_funding_account_once(svc):
    before = db.get_account("ACC-SAL-001")["available_balance_minor"]
    fd = {"funding_account_id": "ACC-SAL-001", "amount_minor": 2_500_000, "tenure_months": 12,
          "maturity_instruction": "RENEW_PRINCIPAL"}
    ref = svc.submit(product_id="PROD-FD-SMART", mobile=_applicant()[0], payload=fd, customer_id="CUST-1001",
                     user_id="USR-AARAV")["reference"]
    done = svc.worker.process(ref)
    assert done["status"] == "OPENED" and done["cbs"]["fd_number"].startswith("FD")
    assert db.get_account("ACC-SAL-001")["available_balance_minor"] == before - 2_500_000
    deposit = next(a for a in db.snapshot()["accounts"].values() if a.get("source_application") == ref)
    assert deposit["type"] == "FIXED_DEPOSIT" and deposit["balance_minor"] == 2_500_000 and deposit["rate_percent"] == 8.10
    entries = [t for t in db.snapshot()["transactions"] if t.get("reference") == ref]
    assert sorted(t["amount_minor"] for t in entries) == [-2_500_000, 2_500_000]


def test_core_refusal_is_reported_not_retried(svc):
    mobile, payload = _applicant(pan="ABCPM0001M")  # Aarav's PAN: the core already has this customer
    ref = _approved(svc, payload, mobile)
    done = svc.worker.process(ref)
    assert done["status"] == "CBS_REJECTED" and "DUPLICATE PAN" in done["rpa"]["last_error"]
    assert svc.applicant_status(ref, mobile)["status"] == "APPROVED"  # the applicant is told only "being set up"


def test_a_retry_resumes_an_earlier_maker_entry_and_never_opens_two(svc, core_url):
    mobile, payload = _applicant()
    ref = _approved(svc, payload, mobile)
    maker = requests.Session()  # an earlier run that keyed everything and stopped before the checker
    maker.post(f"{core_url}/login", data={"operator_id": "RPA-MAKER", "password": "maker-demo"})
    page = maker.post(f"{core_url}/customer/new", data={
        "customerName": "RIYA SHAH", "panNumber": payload["pan_number"], "dateOfBirth": "14/08/1994", "mobileNumber": mobile,
        "email": "riya@example.com", "residentialAddress": "12 LAKE ROAD", "city": "PUNE", "pincode": "411001", "portalReference": ref})
    cif = page.text.split('id="lblCifNumber">')[1].split("<")[0]
    maker.post(f"{core_url}/account/new", data={"cif": cif, "schemeCode": "SB_GEN_IND", "portalReference": ref})
    done = svc.worker.process(ref)
    assert done["status"] == "OPENED" and done["cbs"]["cif_number"] == cif
    assert "NEW_CUSTOMER" not in [e["step"] for e in done["rpa"]["events"]]
    found = maker.get(f"{core_url}/enquiry", params={"ref": ref}).text
    assert found.count('data-kind="ACCOUNT"') == 1


def test_robot_failure_is_recorded_for_an_officer(svc):
    mobile, payload = _applicant()
    ref = _approved(svc, payload, mobile)
    with socket.socket() as probe:  # a port nothing listens on: the core is down
        probe.bind(("127.0.0.1", 0))
        down = f"http://127.0.0.1:{probe.getsockname()[1]}"
    done = AccountRobotWorker(svc, db, down).process(ref)
    assert done["status"] == "RPA_FAILED" and done["rpa"]["last_error"]


def test_existing_customers_get_their_core_identifiers_back(svc):
    def strip(state):
        state["customers"]["CUST-1001"].pop("cif_number", None)
        state["accounts"]["ACC-SAL-001"].pop("cbs_account_number", None)
    db.transaction(strip)
    assert link_existing_customers(db) == 2
    assert db.snapshot()["customers"]["CUST-1001"]["cif_number"] == "CIF0001001"
    assert db.get_account("ACC-SAL-001")["cbs_account_number"] == "109200004821"
    assert link_existing_customers(db) == 0
