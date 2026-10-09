"""Account applications: one pipeline to open a savings account or a fixed deposit.

    savings (new to bank, or an existing customer)        FD (existing, KYC-verified customer only)
            │ submit                                            │ submit: no officer review
            ▼                                                   │
        SUBMITTED ── officer REJECT (reason) ──▶ REJECTED       │
            │ officer APPROVE (KYC verified first)              │
            ▼                                                   ▼
      QUEUED_FOR_CBS ◀──────── officer retry ────────── RPA_FAILED / CBS_REJECTED ── officer REJECT ──▶ REJECTED
            │ the robot claims it                                   ▲
            ▼                                                       │ the robot fails / the core refuses
      RPA_EXECUTING ─▶ CBS_MAKER_DONE ─▶ CBS_AUTHORISED ─▶ OPENED ──┘ (from RPA_EXECUTING or CBS_MAKER_DONE)

The legacy core has no API: the robot keys the application into its maker screen, authorises it on its checker screen,
and reads the CIF and account (or FD) number back. Kosh mirrors only what the core returned. Every transition is kept in
the application's history and in the tamper-evident audit trail, in the same database transaction.

A rejected applicant sees the officer's reason and may apply again (a new application, prefilled from the rejected one).
While the core-banking step is retried, the applicant is told only that the account is being set up.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import re
import uuid
from datetime import timedelta, timezone
from typing import Any, Callable, Optional

from sqlalchemy import select

from persistence import AccountApplicationRecord, UserRecord, utc_dt

KINDS = {"savings": "SAVINGS", "deposits": "FD"}           # product category -> application kind
PREFIX = {"SAVINGS": "SAV-APP", "FD": "FD-APP"}
REFERENCE = re.compile(r"(SAV|FD)-APP-[A-Z0-9]{8}")
OPEN = {"SUBMITTED", "QUEUED_FOR_CBS", "RPA_EXECUTING", "CBS_MAKER_DONE", "CBS_AUTHORISED", "RPA_FAILED", "CBS_REJECTED"}
NEXT = {  # the only moves the pipeline allows
    "SUBMITTED": {"QUEUED_FOR_CBS", "REJECTED"},
    "QUEUED_FOR_CBS": {"RPA_EXECUTING"},
    "RPA_EXECUTING": {"CBS_MAKER_DONE", "RPA_FAILED", "CBS_REJECTED", "QUEUED_FOR_CBS"},
    "CBS_MAKER_DONE": {"CBS_AUTHORISED", "RPA_FAILED", "CBS_REJECTED"},
    "CBS_AUTHORISED": {"OPENED"},
    "RPA_FAILED": {"QUEUED_FOR_CBS", "REJECTED"},
    "CBS_REJECTED": {"QUEUED_FOR_CBS", "REJECTED"},
    "OPENED": set(),
    "REJECTED": set(),
}
# Independent KYC checks an officer confirms before a new customer's account is opened (KYC first), as for P1-17.
KYC_CHECKS = {"document_authenticity", "pan_or_form60", "identity_match", "screening", "declarations"}
# What the applicant is told: never internal states, robot errors or officer notes beyond the decision reason.
APPLICANT_STATUS = {
    "SUBMITTED": ("UNDER_REVIEW", "Under review", "A Kosh officer is reviewing your application."),
    "REJECTED": ("NOT_APPROVED", "Not approved", "Your application was not approved. You can apply again."),
    "OPENED": ("OPENED", "Account opened", "Your account is open."),
}
SETTING_UP = ("APPROVED", "Approved, being set up", "Your application is approved and your account is being set up.")


class ApplicationError(ValueError):
    """An application request that breaks a rule (shown to the caller as a 4xx, never as a server error)."""


def mobile_token(mobile: str) -> str:
    """Keyed hash of the applicant's mobile, so status lookups and duplicate checks need no decryption."""
    from backend.settings import required_secret
    from auth_service import normalize_phone
    key = required_secret("SENTINEL_AUDIT_HMAC_KEY", "sentinel-demo-audit-key").encode("utf-8")
    return hmac.new(key, b"applicant-mobile|" + normalize_phone(str(mobile)).encode("utf-8"), hashlib.sha256).hexdigest()


def _seal(payload: dict[str, Any]) -> str:
    from document_processing import cipher
    return cipher().encrypt(json.dumps(payload, ensure_ascii=False).encode("utf-8")).decode()


def _unseal(sealed: str) -> dict[str, Any]:
    from document_processing import cipher
    return json.loads(cipher().decrypt(sealed.encode()).decode("utf-8"))


def _aware(value):
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)  # SQLite returns naive datetimes


class AccountApplicationService:
    def __init__(self, database, on_queued: Optional[Callable[[str], None]] = None) -> None:
        self.db = database
        self.runtime = database.runtime
        self.on_queued = on_queued  # starts the core-banking robot for a reference (wired in by the app)

    # ---- submission ------------------------------------------------------------------------------------------
    def submit(self, *, product_id: str, mobile: str, payload: dict[str, Any], customer_id: Optional[str] = None,
               user_id: Optional[str] = None, documents: Optional[list[dict[str, Any]]] = None,
               reapplied_from: Optional[str] = None) -> dict[str, Any]:
        """Record a completed application form. Savings goes to officer review; an FD for a verified customer is queued
        for the core at once. `payload` holds the form fields; it is encrypted at rest."""
        from product_service import get_product_by_id
        product = get_product_by_id(product_id)
        kind = KINDS.get((product or {}).get("category", ""))
        if not kind:
            raise ApplicationError("Only savings accounts and fixed deposits can be opened here.")
        token = mobile_token(mobile)
        track = "EXISTING_CUSTOMER" if customer_id else "NEW_TO_BANK"
        status = "SUBMITTED"
        if kind == "FD":
            self._check_fd(customer_id, payload)
            status = "QUEUED_FOR_CBS"  # an existing, verified customer books an FD without officer review
        with self.db._lock, self.runtime.sessions.begin() as session:
            # One open application per applicant and kind: a second click or a second tab must not open two accounts.
            if session.scalar(select(AccountApplicationRecord.id).where(
                    AccountApplicationRecord.mobile_token == token, AccountApplicationRecord.kind == kind,
                    AccountApplicationRecord.status.in_(OPEN))):
                raise ApplicationError("You already have an application in progress for this product type. "
                                       "Check its status with your reference.")
            now = utc_dt()
            row = AccountApplicationRecord(
                id=f"{PREFIX[kind]}-{uuid.uuid4().hex[:8].upper()}", product_id=product_id, kind=kind, track=track,
                customer_id=customer_id, user_id=user_id, mobile_token=token, status=status, payload_sealed=_seal(payload),
                documents=documents or [], cbs={}, rpa={"attempts": 0}, history=[], reapplied_from=reapplied_from,
                created_at=now, updated_at=now)
            self._log(session, row, None, "SUBMITTED", by=user_id or "applicant", actor="customer" if customer_id else "visitor",
                      note="Application submitted")
            if status == "QUEUED_FOR_CBS":
                self._log(session, row, "SUBMITTED", "QUEUED_FOR_CBS", by="system", actor="system",
                          note="Fixed deposit for a KYC-verified customer: no officer review")
            session.add(row)
            reference = row.id
        if status == "QUEUED_FOR_CBS":
            self._queued(reference)
        return self.get(reference)

    def _check_fd(self, customer_id: Optional[str], payload: dict[str, Any]) -> None:
        if not customer_id:
            raise ApplicationError("A fixed deposit needs an active Kosh savings account. Open a savings account first.")
        if (self.db.get_kyc_profile(customer_id) or {}).get("status") != "VERIFIED":
            raise ApplicationError("Complete your KYC before booking a fixed deposit.")
        account = self.db.get_account(str(payload.get("funding_account_id", "")).upper())
        if not account or account.get("customer_id") != customer_id or account.get("status") != "ACTIVE":
            raise ApplicationError("Choose one of your active savings accounts to fund the deposit.")
        amount = payload.get("amount_minor")
        if not isinstance(amount, int) or amount <= 0:
            raise ApplicationError("Enter the deposit amount.")
        if amount > int(account.get("available_balance_minor") or 0):
            raise ApplicationError("The funding account does not have enough available balance for this deposit.")

    # ---- officer review --------------------------------------------------------------------------------------
    def decide(self, reference: str, *, officer_user_id: str, action: str, reason: str,
               kyc_checks: Optional[list[str]] = None, kyc_reference: str = "") -> dict[str, Any]:
        """APPROVE (queues the core-banking entry) or REJECT with a reason the applicant will see. A savings account for a
        customer whose KYC is not verified is approved only with the independent KYC checks (KYC first)."""
        action = action.upper()
        if action not in {"APPROVE", "REJECT"}:
            raise ApplicationError("Choose Approve or Reject.")
        reason = (reason or "").strip()
        if len(reason) < 10:
            raise ApplicationError("Give a reason of at least 10 characters. A rejection reason is shown to the applicant.")
        with self.db._lock, self.runtime.sessions.begin() as session:
            row = self._locked(session, reference)
            allowed = {"SUBMITTED"} if action == "APPROVE" else {"SUBMITTED", "RPA_FAILED", "CBS_REJECTED"}
            if row.status not in allowed:
                raise ApplicationError(f"This application is {row.status} and cannot be {'approved' if action == 'APPROVE' else 'rejected'} now.")
            officer = session.get(UserRecord, officer_user_id)
            if row.user_id and row.user_id == officer_user_id:
                raise ApplicationError("Four-eyes rule: an officer cannot decide their own application.")
            if officer and officer.customer_id and officer.customer_id == row.customer_id:
                raise ApplicationError("Four-eyes rule: an officer cannot decide an application on their own customer account.")
            if action == "APPROVE" and self._kyc_required(row):
                missing = KYC_CHECKS - set(kyc_checks or [])
                if missing or len((kyc_reference or "").strip()) < 8:
                    raise ApplicationError("KYC comes first: confirm every independent KYC check and record the bank "
                                           f"verification reference (missing: {', '.join(sorted(missing)) or 'reference'}).")
                row.kyc_verification = {"checks": sorted(KYC_CHECKS), "reference": kyc_reference.strip(),
                                        "by": officer_user_id, "at": utc_dt().isoformat()}
            row.decision = {"action": action, "by": officer_user_id, "at": utc_dt().isoformat(), "reason": reason}
            target = "QUEUED_FOR_CBS" if action == "APPROVE" else "REJECTED"
            self._move(session, row, target, by=officer_user_id, actor="officer", note=f"Officer {action.lower()}d: {reason}")
        if target == "QUEUED_FOR_CBS":
            self._queued(reference)
        return self.get(reference)

    def _kyc_required(self, row: AccountApplicationRecord) -> bool:
        if row.track == "NEW_TO_BANK":
            return True
        return (self.db.get_kyc_profile(row.customer_id) or {}).get("status") != "VERIFIED"

    def retry(self, reference: str, *, officer_user_id: str) -> dict[str, Any]:
        """Queue the core-banking entry again after the robot failed or the core refused it."""
        with self.db._lock, self.runtime.sessions.begin() as session:
            row = self._locked(session, reference)
            if row.status not in {"RPA_FAILED", "CBS_REJECTED"}:
                raise ApplicationError("Only a failed core-banking entry can be retried.")
            self._move(session, row, "QUEUED_FOR_CBS", by=officer_user_id, actor="officer", note="Officer retried the core-banking entry")
        self._queued(reference)
        return self.get(reference)

    # ---- the core-banking robot ------------------------------------------------------------------------------
    def claim(self, reference: str) -> bool:
        """Atomically take a queued application for the robot, so only one instance ever keys it into the core."""
        with self.db._lock, self.runtime.sessions.begin() as session:
            row = self._locked(session, reference, missing_ok=True)
            if not row or row.status != "QUEUED_FOR_CBS":
                return False
            row.rpa = {**(row.rpa or {}), "attempts": int((row.rpa or {}).get("attempts", 0)) + 1}
            self._move(session, row, "RPA_EXECUTING", by="RPA", actor="rpa", note="Robot started the core-banking entry")
            return True

    def maker_done(self, reference: str, *, maker_reference: str, cif_number: Optional[str] = None) -> dict[str, Any]:
        return self._robot_step(reference, "CBS_MAKER_DONE", {"maker_reference": maker_reference, "cif_number": cif_number},
                                "Maker entry saved in the core")

    def authorised(self, reference: str, *, checker_reference: str, cif_number: str,
                   account_number: Optional[str] = None, fd_number: Optional[str] = None) -> dict[str, Any]:
        if not (account_number or fd_number):
            raise ApplicationError("The core returned no account or deposit number.")
        return self._robot_step(reference, "CBS_AUTHORISED", {"checker_reference": checker_reference, "cif_number": cif_number,
                                                               "account_number": account_number, "fd_number": fd_number},
                                "Checker authorised the entry in the core")

    def opened(self, reference: str, *, customer_id: str) -> dict[str, Any]:
        """Kosh has mirrored what the core returned (customer, account or deposit): the application is complete."""
        with self.db._lock, self.runtime.sessions.begin() as session:
            row = self._locked(session, reference)
            row.customer_id = row.customer_id or customer_id
            self._move(session, row, "OPENED", by="system", actor="system", note="Mirrored in Kosh from the core")
        return self.get(reference)

    def failed(self, reference: str, *, error: str, refused_by_core: bool = False) -> dict[str, Any]:
        """The robot could not finish (RPA_FAILED), or the core refused the entry (CBS_REJECTED). An officer retries or rejects."""
        target = "CBS_REJECTED" if refused_by_core else "RPA_FAILED"
        with self.db._lock, self.runtime.sessions.begin() as session:
            row = self._locked(session, reference)
            row.rpa = {**(row.rpa or {}), "last_error": str(error)[:500]}
            self._move(session, row, target, by="RPA", actor="rpa", note=str(error)[:200])
        return self.get(reference)

    def note_progress(self, reference: str, event: dict[str, Any]) -> None:
        """One robot progress event (no screenshot), kept on the application for the officer; the last 40 are kept."""
        with self.db._lock, self.runtime.sessions.begin() as session:
            row = self._locked(session, reference, missing_ok=True)
            if row:
                events = [*((row.rpa or {}).get("events") or []), {**event, "at": utc_dt().isoformat()}][-40:]
                row.rpa = {**(row.rpa or {}), "events": events}

    def _robot_step(self, reference: str, target: str, cbs: dict[str, Any], note: str) -> dict[str, Any]:
        with self.db._lock, self.runtime.sessions.begin() as session:
            row = self._locked(session, reference)
            row.cbs = {**(row.cbs or {}), **{k: v for k, v in cbs.items() if v}}
            self._move(session, row, target, by="RPA", actor="rpa", note=note)
        return self.get(reference)

    def requeue_stale(self, stale_after: timedelta = timedelta(minutes=15)) -> list[str]:
        """After a restart: queue again everything approved whose robot never ran or stopped mid-run. The database, not
        process memory, records what still has to reach the core."""
        stale_before = utc_dt() - stale_after
        queued = []
        with self.db._lock, self.runtime.sessions.begin() as session:
            for row in session.scalars(select(AccountApplicationRecord).where(
                    AccountApplicationRecord.status.in_(["QUEUED_FOR_CBS", "RPA_EXECUTING"])).with_for_update()):
                if row.status == "RPA_EXECUTING":
                    if _aware(row.updated_at) > stale_before:
                        continue  # another instance is running it now
                    self._move(session, row, "QUEUED_FOR_CBS", by="system", actor="system", note="Re-queued after the robot stopped")
                queued.append(row.id)
        for reference in queued:
            self._queued(reference)
        return queued

    def _queued(self, reference: str) -> None:
        if self.on_queued:
            self.on_queued(reference)

    # ---- reading ---------------------------------------------------------------------------------------------
    def get(self, reference: str, *, with_payload: bool = False) -> Optional[dict[str, Any]]:
        with self.runtime.sessions() as session:
            row = session.get(AccountApplicationRecord, reference)
            return self._dict(row, with_payload) if row else None

    def find(self, statuses: Optional[list[str]] = None, limit: int = 100) -> list[dict[str, Any]]:
        with self.runtime.sessions() as session:
            query = select(AccountApplicationRecord).order_by(AccountApplicationRecord.updated_at.desc()).limit(limit)
            if statuses:
                query = query.where(AccountApplicationRecord.status.in_(statuses))
            return [self._dict(row, False) for row in session.scalars(query)]

    def payload(self, reference: str) -> dict[str, Any]:
        """The decrypted form, for the officer's review and the robot. Never for the applicant-facing status."""
        with self.runtime.sessions() as session:
            row = session.get(AccountApplicationRecord, reference)
            if not row:
                raise KeyError("Application not found")
            return _unseal(row.payload_sealed)

    def applicant_status(self, reference: str, mobile: str) -> Optional[dict[str, Any]]:
        """For someone who knows both the reference and the mobile they applied with. The same None for an unknown
        reference and a wrong mobile, so references cannot be enumerated."""
        reference = (reference or "").strip().upper()
        if not REFERENCE.fullmatch(reference):
            return None
        with self.runtime.sessions() as session:
            row = session.get(AccountApplicationRecord, reference)
            if not row or not hmac.compare_digest(row.mobile_token, mobile_token(mobile)):
                return None
            code, label, next_step = APPLICANT_STATUS.get(row.status, SETTING_UP)
            status = {"reference": row.id, "product_id": row.product_id, "kind": row.kind, "status": code,
                      "status_label": label, "next_step": next_step, "submitted_at": row.created_at.isoformat(),
                      "updated_at": row.updated_at.isoformat()}
            if row.status == "REJECTED":
                status.update(reason=(row.decision or {}).get("reason"), can_apply_again=True)
            if row.status == "OPENED":
                status.update(account_number_masked=_mask((row.cbs or {}).get("account_number") or (row.cbs or {}).get("fd_number")))
            return status

    def prefill_for_reapply(self, reference: str, mobile: str) -> dict[str, Any]:
        """The rejected application's form, to start a new one. Documents are not carried over: upload them again."""
        status = self.applicant_status(reference, mobile)
        if not status or status["status"] != "NOT_APPROVED":
            raise ApplicationError("Only a rejected application can be used to apply again.")
        record = self.get(status["reference"])
        return {"reapplied_from": status["reference"], "product_id": record["product_id"], "fields": self.payload(status["reference"])}

    # ---- helpers ---------------------------------------------------------------------------------------------
    def _locked(self, session, reference: str, missing_ok: bool = False) -> Optional[AccountApplicationRecord]:
        row = session.execute(select(AccountApplicationRecord).where(
            AccountApplicationRecord.id == reference).with_for_update()).scalar_one_or_none()
        if not row and not missing_ok:
            raise KeyError("Application not found")
        return row

    def _move(self, session, row: AccountApplicationRecord, target: str, *, by: str, actor: str, note: str) -> None:
        if target not in NEXT.get(row.status, set()):
            raise ApplicationError(f"An application cannot go from {row.status} to {target}.")
        self._log(session, row, row.status, target, by=by, actor=actor, note=note)
        row.status, row.updated_at = target, utc_dt()

    def _log(self, session, row: AccountApplicationRecord, source: Optional[str], target: str, *, by: str, actor: str,
             note: str) -> None:
        at = utc_dt().isoformat()
        row.history = [*(row.history or []), {"at": at, "from": source, "to": target, "by": by, "note": note}]
        self.db._persist_audit(session, {
            "id": f"AUD-{uuid.uuid4().hex}", "event_type": f"ACCOUNT_APPLICATION_{target}", "customer_id": row.customer_id,
            "actor": actor, "approval_request_id": row.id, "approver_id": by if actor == "officer" else None,
            "summary": f"{row.id} {source or 'NEW'} -> {target}", "details": {"kind": row.kind, "track": row.track, "note": note}})

    @staticmethod
    def _dict(row: AccountApplicationRecord, with_payload: bool) -> dict[str, Any]:
        data = {"reference": row.id, "product_id": row.product_id, "kind": row.kind, "track": row.track,
                "customer_id": row.customer_id, "user_id": row.user_id, "status": row.status, "documents": row.documents,
                "decision": row.decision, "kyc_verification": row.kyc_verification, "cbs": row.cbs, "rpa": row.rpa,
                "history": row.history, "reapplied_from": row.reapplied_from,
                "created_at": row.created_at.isoformat(), "updated_at": row.updated_at.isoformat()}
        if with_payload:
            data["payload"] = _unseal(row.payload_sealed)
        return data


def _mask(number: Optional[str]) -> Optional[str]:
    return f"•••• {str(number)[-4:]}" if number else None


# ---- Kosh mirrors what the core created ----------------------------------------------------------------------------
def mirror_opened(db, application: dict[str, Any], payload: dict[str, Any], core: dict[str, Any]) -> str:
    """Record in Kosh what the legacy core opened, keyed on the application reference so it never happens twice.
    Returns the Kosh customer id. A new customer arrives KYC-verified: the officer verified KYC before approving."""
    from product_service import get_product_by_id
    reference, now = application["reference"], utc_dt().isoformat()
    product = get_product_by_id(application["product_id"]) or {}

    def mutate(state: dict[str, Any]) -> str:
        accounts, customers = state.setdefault("accounts", {}), state.setdefault("customers", {})
        done = next((a for a in accounts.values() if a.get("source_application") == reference), None)
        if done:
            return done["customer_id"]
        customer_id = application.get("customer_id") or _new_customer(state, application, payload, core, now)
        customer = customers[customer_id]
        customer.setdefault("cif_number", core["cif_number"])
        account_id = f"ACC-{'FD' if application['kind'] == 'FD' else 'SAV'}-{uuid.uuid4().hex[:6].upper()}"
        number = core.get("fd_number") or core["account_number"]
        account = {"id": account_id, "customer_id": customer_id, "account_number": number, "cbs_account_number": number,
                   "account_number_masked": f"•••• {number[-4:]}", "name": product.get("title", "Kosh account"),
                   "currency": "INR", "status": "ACTIVE", "source_application": reference, "created_at": now}
        if application["kind"] == "FD":
            _book_deposit(state, account, payload, reference, now)
        else:
            primary = not any(a.get("customer_id") == customer_id for a in accounts.values())
            account.update(type="SAVINGS", balance_minor=0, available_balance_minor=0, is_primary=primary)
        accounts[account_id] = account
        delegation = next((d for d in state.get("delegations", {}).values() if d.get("customer_id") == customer_id), None)
        if delegation is not None and account["type"] == "SAVINGS":
            delegation["allowed_accounts"] = sorted({*delegation.get("allowed_accounts", []), account_id})
        state.setdefault("audit_events", []).append({
            "id": f"AUD-{uuid.uuid4().hex}", "event_type": "ACCOUNT_MIRRORED_FROM_CORE", "customer_id": customer_id,
            "actor": "system", "approval_request_id": reference, "created_at": now,
            "summary": f"{reference}: {account['type']} {account['account_number_masked']} opened in the core, mirrored in Kosh",
            "details": {"cif": core["cif_number"], "checker_reference": core.get("checker_reference")}})
        return customer_id

    return db.transaction(mutate)


def _new_customer(state: dict[str, Any], application: dict[str, Any], payload: dict[str, Any], core: dict[str, Any],
                  now: str) -> str:
    customers = state.setdefault("customers", {})
    taken = [int(c.split("-")[1]) for c in customers if c.startswith("CUST-") and c.split("-")[1].isdigit()]
    customer_id = f"CUST-{max(taken + [1002]) + 1}"
    name = " ".join(str(payload["full_name"]).split())
    mobile = "+91" + str(payload["mobile"])[-10:]
    pan = str(payload["pan_number"]).upper()
    verification = application.get("kyc_verification") or {}
    customers[customer_id] = {
        "id": customer_id, "cif_number": core["cif_number"], "first_name": name.split()[0].title(), "full_name": name.title(),
        "display_name": name.title(), "phone_number": mobile, "phone_masked": "+91 ••••• " + mobile[-5:],
        "email": str(payload.get("email") or ""), "city": str(payload.get("city") or "").title(), "status": "ACTIVE",
        "tier": "Personal", "member_since": now[:10], "normal_transfer_minor": 800000, "primary_device_id": f"DEVICE-{customer_id}",
        "kyc": {"status": "VERIFIED", "kyc_type": "INITIAL_KYC", "full_name": name.title(),
                "date_of_birth": str(payload.get("date_of_birth") or ""), "pan_masked": "••••••" + pan[-4:],
                "aadhaar_masked": ("•••• •••• " + str(payload["document_last4"])) if payload.get("document_last4") else "UNVERIFIED",
                "address": str(payload.get("address") or ""), "city": str(payload.get("city") or ""),
                "state": str(payload.get("state") or ""), "pincode": str(payload.get("pincode") or ""),
                "risk_category": "LOW", "due_date": f"{int(now[:4]) + 10}{now[4:10]}", "last_verified_date": now[:10],
                "verification_reference": verification.get("reference"), "pending_requirements": [], "account_restrictions": []}}
    state.setdefault("devices", {})[f"DEVICE-{customer_id}"] = {
        "id": f"DEVICE-{customer_id}", "customer_id": customer_id, "status": "NEW", "first_seen_at": now, "label": "New customer device"}
    state.setdefault("delegations", {})[f"DLG-{customer_id}"] = {
        "id": f"DLG-{customer_id}", "customer_id": customer_id, "agent_id": "banking-agent-v1", "status": "ACTIVE",
        "allowed_actions": ["READ_ACCOUNTS", "READ_TRANSACTIONS", "READ_BILLS", "READ_ALERTS", "PAY_BILL", "TRANSFER", "FREEZE_CARD"],
        "allowed_accounts": [], "max_autonomous_bill_minor": 500000, "max_daily_minor": 20000000, "expires_at": "2027-12-31T23:59:59Z"}
    return customer_id


def _book_deposit(state: dict[str, Any], account: dict[str, Any], payload: dict[str, Any], reference: str, now: str) -> None:
    """The deposit's money moves inside Kosh's ledger: debit the funding account, open the deposit with that balance."""
    amount = int(payload["amount_minor"])
    funding = state["accounts"].get(str(payload["funding_account_id"]).upper())
    if not funding or funding.get("customer_id") != account["customer_id"]:
        raise ApplicationError("The funding account is not this customer's.")
    if int(funding.get("available_balance_minor") or 0) < amount:
        # ponytail: checked at submission; a balance hold placed at submission (later step) makes this unreachable
        raise ApplicationError("The funding account no longer has enough available balance for the deposit.")
    funding["balance_minor"] = int(funding.get("balance_minor") or 0) - amount
    funding["available_balance_minor"] = int(funding.get("available_balance_minor") or 0) - amount
    account.update(type="FIXED_DEPOSIT", balance_minor=amount, available_balance_minor=amount, is_primary=False,
                   tenure_months=int(payload["tenure_months"]), rate_percent=8.10, funding_account_id=funding["id"],
                   maturity_instruction=str(payload.get("maturity_instruction") or "RENEW_PRINCIPAL_INTEREST"))
    for account_id, amount_minor, description in ((funding["id"], -amount, f"Fixed deposit {account['account_number_masked']} booked"),
                                                  (account["id"], amount, "Deposit opened")):
        state.setdefault("transactions", []).append({
            "id": f"TXN-{uuid.uuid4().hex[:12].upper()}", "customer_id": account["customer_id"], "account_id": account_id,
            "created_at": now, "description": description, "category": "FIXED_DEPOSIT", "amount_minor": amount_minor,
            "currency": "INR", "status": "COMPLETED", "reference": reference})


def link_existing_customers(db) -> int:
    """Copy the core identifiers (CIF, core account numbers) of the bank's existing customers from the seed onto live
    records that predate them. Idempotent; returns how many records were linked."""
    seed, live = db._seed(), db.snapshot()
    missing = [("customers", key, "cif_number", item["cif_number"]) for key, item in seed.get("customers", {}).items()
               if item.get("cif_number") and key in live.get("customers", {}) and not live["customers"][key].get("cif_number")]
    missing += [("accounts", key, "cbs_account_number", item["cbs_account_number"]) for key, item in seed.get("accounts", {}).items()
                if item.get("cbs_account_number") and key in live.get("accounts", {})
                and not live["accounts"][key].get("cbs_account_number")]
    if not missing:
        return 0

    def mutate(state: dict[str, Any]) -> int:
        for collection, key, field, value in missing:
            state[collection][key][field] = value
        return len(missing)
    return db.transaction(mutate)
