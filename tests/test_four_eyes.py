"""Four-eyes rule: no officer decides their own account, and an escalation is approved by someone else."""
import pytest

from banking_db import db
from persistence import UserRecord
from service_requests import ServiceRequestService


def _ensure_user(user_id, customer_id):
    with db.runtime.sessions.begin() as s:
        if not s.get(UserRecord, user_id):
            s.add(UserRecord(id=user_id, username=user_id.lower(), display_name=user_id, role="OFFICER",
                             customer_id=customer_id, active=True))


def _request(svc):
    return svc.create(customer_id="CUST-1001", user_id="aarav", service_id="P1-08", data={"card": "1234"},
                      consent_id="CONS-4E", session_id="SESS-4E")


def test_officer_cannot_decide_own_customer_account():
    _ensure_user("USR-OFFICER-SELF", "CUST-1001")
    svc = ServiceRequestService(db)
    req = _request(svc)
    with pytest.raises(ValueError, match="Four-eyes"):
        svc.decide(req["id"], officer_user_id="USR-OFFICER-SELF", action="APPROVE", reason="Looks fine")


def test_escalating_officer_cannot_approve_but_another_can():
    _ensure_user("USR-OFFICER-SENIOR", None)
    svc = ServiceRequestService(db)
    req = _request(svc)
    svc.decide(req["id"], officer_user_id="USR-OFFICER-001", action="ESCALATE", reason="Needs a senior review")
    with pytest.raises(ValueError, match="Four-eyes"):
        svc.decide(req["id"], officer_user_id="USR-OFFICER-001", action="APPROVE", reason="Approving my escalation")
    assert svc.decide(req["id"], officer_user_id="USR-OFFICER-SENIOR", action="APPROVE",
                      reason="Senior review done")["status"] != "ESCALATED"
