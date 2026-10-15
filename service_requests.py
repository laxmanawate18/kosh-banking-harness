"""PRD service catalogue and durable customer/officer request workflow."""

from __future__ import annotations

import uuid
import copy
import secrets
from datetime import date, timedelta, timezone
from typing import Any

from sqlalchemy import select

from banking_db import BankingDatabase, utc_now
from persistence import ApprovalActionRecord, BankingWorkflowRecord, ServiceRequestRecord, UserRecord, utc_dt


def _aware(value):
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)  # SQLite returns naive datetimes


def _service(service_id: str, name: str, level: str, mode: str, phase: str = "P1") -> dict[str, str]:
    return {"id": service_id, "name": name, "auth_level": level, "mode": mode, "phase": phase,
            "availability": "WORKFLOW_READY"}


SERVICE_CATALOGUE = [
    _service("P1-01", "Balance enquiry", "L1", "AUTONOMOUS"),
    _service("P1-02", "Mini statement", "L1", "AUTONOMOUS"),
    _service("P1-03", "Account statement request", "L2", "AUTONOMOUS"),
    _service("P1-04", "Cheque book request", "L2", "AUTONOMOUS"),
    _service("P1-05", "Stop cheque", "L2", "AUTONOMOUS"),
    _service("P1-06", "Cheque status enquiry", "L1", "AUTONOMOUS"),
    _service("P1-07", "Debit card block", "L2", "AUTONOMOUS"),
    _service("P1-08", "Debit card reissue", "L3", "HUMAN_APPROVAL"),
    _service("P1-09", "Debit card PIN regeneration", "L3", "AUTONOMOUS"),
    _service("P1-10", "Card transaction controls", "L2", "AUTONOMOUS"),
    _service("P1-11", "Contact detail update", "L3", "HUMAN_APPROVAL"),
    _service("P1-12", "Address update", "L3", "HUMAN_APPROVAL"),
    _service("P1-13", "Nominee enquiry", "L2", "AUTONOMOUS"),
    _service("P1-14", "Nominee update", "L3", "HUMAN_APPROVAL"),
    _service("P1-15", "PAN update", "L3", "HUMAN_APPROVAL"),
    _service("P1-16", "KYC status enquiry", "L2", "AUTONOMOUS"),
    _service("P1-17", "KYC document submission", "L3", "HUMAN_APPROVAL"),
    _service("P1-18", "Fixed deposit enquiry", "L1", "AUTONOMOUS"),
    _service("P1-19", "Fixed deposit opening", "L3", "HUMAN_APPROVAL"),
    _service("P1-20", "Recurring deposit opening", "L3", "HUMAN_APPROVAL"),
    _service("P1-21", "TDS certificate request", "L2", "AUTONOMOUS"),
    _service("P1-22", "Interest certificate request", "L2", "AUTONOMOUS"),
    _service("P1-23", "Branch appointment", "L1", "AUTONOMOUS"),
    _service("P1-24", "Service request status", "L1", "AUTONOMOUS"),
    _service("P1-25", "Savings account opening with CBS RPA entry", "L3", "HUMAN_APPROVAL"),
    _service("P2-01", "Account closure", "L3", "HUMAN_APPROVAL", "P2"),
    _service("P2-02", "Joint holder addition", "L3", "HUMAN_APPROVAL", "P2"),
    _service("P2-03", "Joint holder removal", "L3", "HUMAN_APPROVAL", "P2"),
    _service("P2-04", "Mode of operation change", "L3", "HUMAN_APPROVAL", "P2"),
    _service("P2-05", "Signature update", "L3", "HUMAN_APPROVAL", "P2"),
    _service("P2-06", "Inoperative account activation", "L3", "HUMAN_APPROVAL", "P2"),
    _service("P2-07", "Minor-to-major conversion", "L3", "HUMAN_APPROVAL", "P2"),
    _service("P2-08", "Deceased claim initiation", "L3", "HUMAN_APPROVAL", "P2"),
    _service("P2-09", "Lien removal request", "L3", "HUMAN_APPROVAL", "P2"),
    _service("P2-10", "Standing instruction setup", "L3", "HUMAN_APPROVAL", "P2"),
    _service("P2-11", "Standing instruction cancellation", "L3", "HUMAN_APPROVAL", "P2"),
    _service("P2-12", "Safe deposit locker enquiry", "L2", "AUTONOMOUS", "P2"),
    _service("P2-13", "Safe deposit locker request", "L3", "HUMAN_APPROVAL", "P2"),
    _service("P2-14", "Complex grievance escalation", "L2", "HUMAN_APPROVAL", "P2"),
]
CATALOGUE_BY_ID = {item["id"]: item for item in SERVICE_CATALOGUE}


class ServiceRequestService:
    def __init__(self, database: BankingDatabase) -> None:
        self.db = database
        self.runtime = database.runtime

    def create(self, *, customer_id: str, user_id: str, service_id: str, data: dict[str, Any],
               consent_id: str, session_id: str | None = None) -> dict[str, Any]:
        service = CATALOGUE_BY_ID.get(service_id)
        if not service:
            raise KeyError("Unknown service")
        status = "PENDING_APPROVAL" if service["mode"] == "HUMAN_APPROVAL" else "SUBMITTED"
        now = utc_dt()
        row = ServiceRequestRecord(id=f"REQ-{uuid.uuid4().hex[:16].upper()}", customer_id=customer_id,
                                   session_id=session_id, service_id=service_id, status=status,
                                   auth_level=service["auth_level"], collected_data=data,
                                   findings=[], discrepancy_flags=data.get("discrepancy_flags", []),
                                   confidence_scores=data.get("confidence_scores", {}), created_at=now, updated_at=now)
        with self.db._lock, self.runtime.sessions.begin() as session:
            session.add(row)
        self.db.append_audit("SERVICE_REQUEST_CREATED", session_id=session_id, actor="customer",
                             service_id=service_id, consent_id=consent_id, approval_request_id=row.id,
                             summary=f"{service['name']} request created", details={"status": status, "user_id": user_id})
        return self._dict(row)

    def get(self, request_id: str) -> dict[str, Any] | None:
        with self.runtime.sessions() as session:
            row = session.execute(select(ServiceRequestRecord).where(
                ServiceRequestRecord.id == request_id)).scalar_one_or_none()
            return self._dict(row) if row else None

    def list_for_customer(self, customer_id: str) -> list[dict[str, Any]]:
        with self.runtime.sessions() as session:
            rows = session.scalars(select(ServiceRequestRecord).where(
                ServiceRequestRecord.customer_id == customer_id).order_by(ServiceRequestRecord.updated_at.desc())).all()
            return [self._dict(row) for row in rows]

    def decide(self, request_id: str, *, officer_user_id: str, action: str, reason: str,
               override_justification: str | None = None, verification_checks: list[str] | None = None,
               verification_reference: str = "") -> dict[str, Any]:
        action = action.upper()
        statuses = {"APPROVE": "APPROVED", "REJECT": "REJECTED",
                    "REQUEST_MORE_INFO": "MORE_INFO_REQUIRED", "ESCALATE": "ESCALATED"}
        if action not in statuses:
            raise ValueError("Unsupported approval action")
        if not reason.strip():
            raise ValueError("A reason is required")
        rpa_payload: dict[str, Any] | None = None
        with self.db._lock, self.runtime.sessions.begin() as session:
            row = session.execute(select(ServiceRequestRecord).where(
                ServiceRequestRecord.id == request_id).with_for_update()).scalar_one_or_none()
            if not row:
                raise KeyError("Request not found")
            if row.status not in {"PENDING_APPROVAL", "ESCALATED", "MORE_INFO_REQUIRED", "RPA_FAILED"}:
                raise ValueError("Request is not awaiting an officer decision")
            officer = session.get(UserRecord, officer_user_id)
            if officer and officer.customer_id and officer.customer_id == row.customer_id:
                raise ValueError("Four-eyes rule: an officer cannot decide a request on their own customer account")
            if action == "APPROVE" and session.scalar(select(ApprovalActionRecord.id).where(
                    ApprovalActionRecord.request_id == row.id, ApprovalActionRecord.officer_user_id == officer_user_id,
                    ApprovalActionRecord.action == "ESCALATE")):
                raise ValueError("Four-eyes rule: a request you escalated must be approved by a different officer")
            if row.service_id == "P1-17" and action == "APPROVE":
                required = {"document_authenticity", "pan_or_form60", "identity_match", "screening", "declarations"}
                if not required.issubset(set(verification_checks or [])) or len(verification_reference.strip()) < 8:
                    raise ValueError("Complete independent KYC verification checks and record the bank verification reference before approval")
                row.collected_data = {**row.collected_data, "bank_verification_checks": sorted(required),
                    "bank_verification_reference": verification_reference.strip()}
            if action == "APPROVE" and row.discrepancy_flags and not (override_justification or "").strip():
                raise ValueError("Override justification is required when discrepancies exist")
            row.status = statuses[action]
            row.approver_id = officer_user_id
            row.resolution_reason = reason.strip()
            row.updated_at = utc_dt()
            decision = ApprovalActionRecord(id=f"APR-{uuid.uuid4().hex[:16].upper()}", request_id=row.id,
                                            officer_user_id=officer_user_id, action=action, reason=reason.strip(),
                                            override_justification=(override_justification or "").strip() or None)
            session.add(decision)
            if row.service_id == "P1-17" and action in {"APPROVE", "REJECT"}:
                before = self.db.open_state(session)
                state = copy.deepcopy(before)
                customer = state.get("customers", {}).get(row.customer_id) or state.get("customer")
                profile = customer.setdefault("kyc", {})
                if action == "APPROVE":
                    profile.update({k: v for k, v in row.collected_data.items() if k in {
                        "full_name", "date_of_birth", "pan_masked", "address", "city", "state", "pincode",
                        "occupation", "annual_income_slab", "source_of_funds", "tax_residency", "us_person", "pep_status"}})
                    profile.update(status="VERIFIED", pending_request_id=None, account_restrictions=[],
                        pending_requirements=[], last_verified_date=str(row.updated_at)[:10])
                else:
                    profile.update(status="NOT_DONE" if profile.get("kyc_type") == "INITIAL_KYC" else "PENDING_RE_KYC",
                        pending_request_id=None)
                self.db.save_state(session, before, state)

            if action == "APPROVE" and row.service_id != "P1-17":
                before = self.db.open_state(session)
                state = copy.deepcopy(before)
                customer_targets = []
                if "customers" in state and row.customer_id in state["customers"]:
                    customer_targets.append(state["customers"][row.customer_id])
                if "customer" in state and (state["customer"].get("id") == row.customer_id or row.customer_id == "CUST-1001"):
                    customer_targets.append(state["customer"])
                if not customer_targets:
                    cust_entry = state.setdefault("customers", {}).setdefault(row.customer_id, {"id": row.customer_id})
                    customer_targets.append(cust_entry)
                state_changed = False

                if row.service_id == "P1-08":  # Debit card reissue
                    cards = state.setdefault("cards", {})
                    for c in cards.values():
                        if c.get("customer_id") == row.customer_id and c.get("status") == "ACTIVE":
                            c["status"] = "REPLACED"
                            c["replaced_at"] = str(row.updated_at)
                    new_card_id = f"CRD-{uuid.uuid4().hex[:8].upper()}"
                    rand_suffix = f"{secrets.randbelow(9000) + 1000}"
                    now_year = date.today().year
                    new_card = {
                        "id": new_card_id,
                        "customer_id": row.customer_id,
                        "card_number_masked": f"•••• •••• •••• {rand_suffix}",
                        "card_type": "DEBIT",
                        "status": "ACTIVE",
                        "expiry_month": 12,
                        "expiry_year": now_year + 5,
                        "daily_limit_minor": 5000000,
                        "online_enabled": True,
                        "international_enabled": False,
                        "issued_at": str(row.updated_at),
                        "reference_request_id": row.id,
                    }
                    cards[new_card_id] = new_card
                    row.collected_data = {**row.collected_data, "issued_card": new_card, "card_id": new_card_id}
                    state_changed = True

                elif row.service_id == "P1-11":  # Contact detail update
                    email = row.collected_data.get("email")
                    mobile = row.collected_data.get("mobile")
                    for cust in customer_targets:
                        changed = False
                        if email:
                            changed = changed or email != cust.get("email")
                            cust["email"] = email
                        if mobile:
                            changed = changed or mobile != cust.get("phone_number")
                            cust["phone_number"] = mobile
                            cust["phone_masked"] = f"+91 ••••• {mobile[-5:]}" if len(mobile) >= 5 else mobile
                        if changed:
                            # Sentinel caps transfers, and new standing instructions wait, for a day after a real change.
                            cust["contact_changed_at"] = utc_now()
                    state_changed = True

                elif row.service_id == "P1-12":  # Address update
                    for cust in customer_targets:
                        for k in ("address", "city", "state", "pincode"):
                            if row.collected_data.get(k):
                                cust[k] = row.collected_data[k]
                        if "kyc" in cust and isinstance(cust["kyc"], dict):
                            for k in ("address", "city", "state", "pincode"):
                                if row.collected_data.get(k):
                                    cust["kyc"][k] = row.collected_data[k]
                    state_changed = True

                elif row.service_id == "P1-14":  # Nominee update
                    acc_id = row.collected_data.get("account_id")
                    if acc_id and acc_id in state.get("accounts", {}):
                        acc = state["accounts"][acc_id]
                        acc["nominee"] = {
                            "name": row.collected_data.get("nominee_name", ""),
                            "relationship": row.collected_data.get("relationship", ""),
                            "dob": row.collected_data.get("nominee_dob", ""),
                            "address": row.collected_data.get("nominee_address", ""),
                            "guardian_name": row.collected_data.get("guardian_name", ""),
                            "updated_at": str(row.updated_at),
                        }
                        state_changed = True

                elif row.service_id == "P1-15":  # PAN update
                    pan = row.collected_data.get("pan_number") or row.collected_data.get("pan")
                    if pan:
                        masked = f"{pan[:2]}••••{pan[-2:]}" if len(pan) >= 4 else pan
                        for cust in customer_targets:
                            cust["pan_masked"] = masked
                            cust.setdefault("kyc", {})["pan_masked"] = masked
                    state_changed = True

                elif row.service_id == "P2-06":  # Inoperative account activation
                    acc_id = row.collected_data.get("account_id")
                    if acc_id and acc_id in state.get("accounts", {}):
                        state["accounts"][acc_id]["status"] = "ACTIVE"
                        state["accounts"][acc_id]["inoperative"] = False
                        state_changed = True

                elif row.service_id == "P2-09":  # Lien removal
                    acc_id = row.collected_data.get("account_id")
                    if acc_id and acc_id in state.get("accounts", {}):
                        state["accounts"][acc_id]["has_lien"] = False
                        state["accounts"][acc_id]["lien_amount_minor"] = 0
                        state_changed = True

                elif row.service_id == "P2-11":  # Standing instruction cancellation
                    si_id = row.collected_data.get("instruction_id") or row.collected_data.get("si_id")
                    sis = state.get("standing_instructions", {})
                    if si_id and si_id in sis:
                        sis[si_id]["status"] = "CANCELLED"
                        sis[si_id]["cancelled_at"] = str(row.updated_at)
                        state_changed = True

                elif row.service_id == "P2-13":  # Safe deposit locker
                    lockers = state.setdefault("lockers", {})
                    lck_id = f"LCK-{uuid.uuid4().hex[:6].upper()}"
                    lockers[lck_id] = {
                        "id": lck_id,
                        "customer_id": row.customer_id,
                        "branch": row.collected_data.get("branch", "Mumbai Fort"),
                        "size": row.collected_data.get("locker_size", "MEDIUM"),
                        "status": "ALLOCATED",
                        "allotted_at": str(row.updated_at),
                        "reference_request_id": row.id,
                    }
                    row.collected_data = {**row.collected_data, "locker": lockers[lck_id]}
                    state_changed = True

                if state_changed:
                    self.db.save_state(session, before, state)
            if row.service_id == "P1-25" and action == "APPROVE":
                row.status = "QUEUED_FOR_CBS"
                rpa_payload = copy.deepcopy(row.collected_data)
                if not rpa_payload.get("pan_number") and rpa_payload.get("workflow_id"):
                    wf_record = session.get(BankingWorkflowRecord, rpa_payload["workflow_id"])
                    if wf_record and wf_record.payload and wf_record.payload.get("fields"):
                        raw_pan = wf_record.payload["fields"].get("pan_number")
                        if raw_pan:
                            rpa_payload["pan_number"] = raw_pan
                            row.collected_data = {**row.collected_data, "pan_number": raw_pan}
            self.db._persist_audit(session, {"id": f"AUD-{uuid.uuid4().hex}", "event_type":"OFFICER_DECISION",
                "session_id":row.session_id, "customer_id":row.customer_id, "actor":"officer",
                "service_id":row.service_id, "approval_request_id":row.id, "approver_id":officer_user_id,
                "summary":f"Officer decision recorded: {action}", "details":{"reason":reason.strip(),
                    "override_justification":decision.override_justification, "new_status":row.status}})
        if rpa_payload is not None:
            from rpa.job_dispatcher import get_job_queue
            get_job_queue().enqueue(request_id, rpa_payload)
        result = self.get(request_id)
        if result is None:
            raise KeyError("Request not found")
        self._notify_decision(result)
        return result

    _STATUS_WORDS = {"APPROVED": "approved", "REJECTED": "not approved", "MORE_INFO_REQUIRED": "waiting for more information",
                     "ESCALATED": "with a senior officer", "QUEUED_FOR_CBS": "approved and being set up",
                     "COMPLETED": "completed", "RPA_FAILED": "delayed; our team is on it"}

    def _notify_decision(self, request: dict[str, Any]) -> None:
        from backend.notifications import notify, phone_for
        phone = phone_for(self.db, request.get("customer_id"))
        if request.get("service_id") == "P1-17" and request.get("status") in ("APPROVED", "REJECTED"):
            event = "kyc_verified" if request["status"] == "APPROVED" else "kyc_not_verified"
            notify(self.db, event, phone, customer_id=request.get("customer_id"), reference=request["id"])
        elif request.get("status") in self._STATUS_WORDS:
            notify(self.db, "service_request_update", phone, customer_id=request.get("customer_id"), reference=request["id"],
                   service=request.get("service_name") or request.get("service_id"), status=self._STATUS_WORDS[request["status"]])

    def claim_for_rpa(self, request_id: str) -> bool:
        """Atomically take an approved request for core-banking automation, so only one instance ever runs it."""
        with self.db._lock, self.runtime.sessions.begin() as session:
            row = session.execute(select(ServiceRequestRecord).where(
                ServiceRequestRecord.id == request_id).with_for_update()).scalar_one_or_none()
            if not row or row.status != "QUEUED_FOR_CBS":
                return False
            row.status, row.updated_at = "RPA_EXECUTING", utc_dt()
            return True

    def requeue_rpa(self, stale_after: timedelta = timedelta(minutes=15)) -> list[str]:
        """After a restart or redeploy: queue again every approved request whose automation never ran, or whose
        instance stopped mid-run. The database, not process memory, is the record of what still has to reach the core."""
        stale_before = utc_dt() - stale_after
        pending = []
        with self.db._lock, self.runtime.sessions.begin() as session:
            for row in session.scalars(select(ServiceRequestRecord).where(
                    ServiceRequestRecord.status.in_(["QUEUED_FOR_CBS", "RPA_EXECUTING"])).with_for_update()):
                if row.status == "RPA_EXECUTING" and _aware(row.updated_at) > stale_before:
                    continue  # another instance is running it now
                row.status = "QUEUED_FOR_CBS"
                pending.append((row.id, copy.deepcopy(row.collected_data)))
        from rpa.job_dispatcher import get_job_queue
        for request_id, payload in pending:
            get_job_queue().enqueue(request_id, payload)
        return [request_id for request_id, _ in pending]

    def apply_rpa_result(self, request_id: str, result: dict[str, Any]) -> None:
        """Persist the result returned by CBS automation and create the linked account once."""
        raw_status = result.get("status", "FAILED")
        status = raw_status.value if hasattr(raw_status, "value") else str(raw_status)
        succeeded = status == "COMPLETED" and result.get("cif_number") and result.get("account_number")
        with self.db._lock, self.runtime.sessions.begin() as session:
            row = session.execute(select(ServiceRequestRecord).where(
                ServiceRequestRecord.id == request_id).with_for_update()).scalar_one_or_none()
            if not row or row.service_id != "P1-25":
                return
            if succeeded:
                cif = str(result["cif_number"])
                account_number = str(result["account_number"])
                row.status = "COMPLETED"
                row.collected_data = {
                    **row.collected_data,
                    "cif_number": cif,
                    "account_number": account_number,
                    "cbs_status": result.get("cbs_status", "PENDING_CHECKER_APPROVAL"),
                    "rpa_completed": True,
                }
                before = self.db.open_state(session)
                state = copy.deepcopy(before)
                accounts = state.setdefault("accounts", {})
                existing = next((account for account in accounts.values()
                                 if account.get("source_request_id") == request_id), None)
                if existing is None:
                    account_id = f"ACC-SAV-{uuid.uuid4().hex[:6].upper()}"
                    scheme = row.collected_data.get("account_scheme")
                    accounts[account_id] = {
                        "id": account_id,
                        "name": "Salary Privilege Account" if scheme == "SALARY_PRIVILEGE" else "Regular Savings Account",
                        "type": "SAVINGS",
                        "status": "PENDING_ACTIVATION",
                        "currency": "INR",
                        "is_primary": False,
                        "customer_id": row.customer_id,
                        "balance_minor": 0,
                        "available_balance_minor": 0,
                        "account_number_masked": f"•••• {account_number[-4:]}",
                        "source_request_id": request_id,
                        "cif_number": cif,
                    }
                    self.db.save_state(session, before, state)
            else:
                row.status = "RPA_FAILED"
                row.collected_data = {**row.collected_data, "rpa_completed": False,
                                      "rpa_error": str(result.get("error") or "CBS automation failed")[:500]}
            row.updated_at = utc_dt()
            self.db._persist_audit(session, {
                "id": f"AUD-{uuid.uuid4().hex}", "event_type": "RPA_ACCOUNT_OPENING_RESULT",
                "session_id": row.session_id, "customer_id": row.customer_id, "actor": "rpa-agent",
                "service_id": row.service_id, "approval_request_id": row.id,
                "summary": "CBS maker entry completed" if succeeded else "CBS maker entry failed",
                "severity": "INFO" if succeeded else "ERROR",
                "details": {"status": row.status, "cbs_status": result.get("cbs_status")},
            })
        updated = self.get(request_id)
        if updated:
            self._notify_decision(updated)

    @staticmethod
    def _dict(row: ServiceRequestRecord) -> dict[str, Any]:
        service = CATALOGUE_BY_ID.get(row.service_id, {"name": row.service_id, "mode": "UNKNOWN", "phase": "UNKNOWN"})
        result = {"id": row.id, "customer_id": row.customer_id, "session_id": row.session_id,
                "service_id": row.service_id, "service_name": service["name"], "mode": service["mode"],
                "phase": service["phase"], "status": row.status, "auth_level": row.auth_level,
                "collected_data": row.collected_data, "findings": row.findings,
                "discrepancy_flags": row.discrepancy_flags, "confidence_scores": row.confidence_scores,
                "approver_id": row.approver_id, "resolution_reason": row.resolution_reason,
                "created_at": row.created_at.isoformat().replace("+00:00", "Z"),
                "updated_at": row.updated_at.isoformat().replace("+00:00", "Z")}
        if row.service_id == "P1-25":
            from rpa.job_dispatcher import get_job_queue
            result["rpa_job"] = get_job_queue().public_job(row.id)
        return result
