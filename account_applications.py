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
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Optional

from sqlalchemy import select

from persistence import AccountApplicationRecord, ApplicationDocumentRecord, UserRecord, utc_dt

KINDS = {"savings": "SAVINGS", "deposits": "FD"}           # product category -> application kind
PREFIX = {"SAVINGS": "SAV-APP", "FD": "FD-APP"}
REFERENCE = re.compile(r"(SAV|FD)-APP-[A-Z0-9]{8}")
OPEN = {"SUBMITTED", "QUEUED_FOR_CBS", "RPA_EXECUTING", "CBS_MAKER_DONE", "CBS_AUTHORISED", "RPA_FAILED", "CBS_REJECTED"}
NEXT = {  # the only moves the pipeline allows
    "SUBMITTED": {"QUEUED_FOR_CBS", "REJECTED"},
    "QUEUED_FOR_CBS": {"RPA_EXECUTING"},
    "RPA_EXECUTING": {"CBS_MAKER_DONE", "RPA_FAILED", "CBS_REJECTED", "QUEUED_FOR_CBS"},
    "CBS_MAKER_DONE": {"CBS_AUTHORISED", "RPA_FAILED", "CBS_REJECTED", "QUEUED_FOR_CBS"},
    "CBS_AUTHORISED": {"OPENED", "RPA_FAILED", "CBS_REJECTED", "QUEUED_FOR_CBS"},
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
ACTIVATION_TRIES, ACTIVATION_LOCKOUT = 5, timedelta(minutes=30)


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
    def __init__(self, database, on_queued: Optional[Callable[[str], None]] = None, auth_service=None) -> None:
        self.db = database
        self.runtime = database.runtime
        self.on_queued = on_queued  # starts the core-banking robot for a reference (wired in by the app)
        self.auth_service = auth_service  # creates a new customer's user id once the account is open

    # ---- submission ------------------------------------------------------------------------------------------
    def submit(self, *, product_id: str, mobile: str, payload: dict[str, Any], customer_id: Optional[str] = None,
               user_id: Optional[str] = None, documents: Optional[list[dict[str, Any]]] = None,
               reapplied_from: Optional[str] = None, findings: Optional[list[dict[str, Any]]] = None) -> dict[str, Any]:
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
                documents=[{k: v for k, v in d.items() if k not in {"content_sealed", "extracted_sealed", "mime_type", "sha256",
                                                                     "size_bytes"}} for d in documents or []],
                cbs={}, rpa={"attempts": 0}, history=[], reapplied_from=reapplied_from, findings=findings or [],
                created_at=now, updated_at=now)
            self._log(session, row, None, "SUBMITTED", by=user_id or "applicant", actor="customer" if customer_id else "visitor",
                      note="Application submitted")
            if status == "QUEUED_FOR_CBS":
                self._log(session, row, "SUBMITTED", "QUEUED_FOR_CBS", by="system", actor="system",
                          note="Fixed deposit for a KYC-verified customer: no officer review")
            session.add(row)
            for document in documents or []:  # the files themselves, encrypted, in their own table
                session.add(ApplicationDocumentRecord(
                    id=document["id"], application_ref=row.id, document_type=document["document_type"],
                    mime_type=document["mime_type"], sha256=document["sha256"], size_bytes=document["size_bytes"],
                    content_sealed=document["content_sealed"], extracted_sealed=document["extracted_sealed"],
                    scan_status=document["scan_status"], created_at=now))
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
            if row.status not in {"RPA_FAILED", "CBS_REJECTED", "CBS_MAKER_DONE", "CBS_AUTHORISED"}:
                raise ApplicationError("Only a failed or stalled core-banking entry can be retried.")
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
        """Kosh has mirrored what the core returned (customer, account or deposit): the application is complete. A new
        customer also gets a user id, with no password: they set one when they activate online banking."""
        application = self.get(reference)
        login = self._new_login(application, customer_id) if application["track"] == "NEW_TO_BANK" else {}
        with self.db._lock, self.runtime.sessions.begin() as session:
            row = self._locked(session, reference)
            row.customer_id = row.customer_id or customer_id
            if login and not (row.activation or {}).get("username"):
                row.activation = login
            self._move(session, row, "OPENED", by="system", actor="system", note="Mirrored in Kosh from the core")
        return self.get(reference)

    def _new_login(self, application: dict[str, Any], customer_id: str) -> dict[str, Any]:
        if (application.get("activation") or {}).get("username") or not self.auth_service:
            return application.get("activation") or {}
        from backend.session_routes import _free_username
        payload = self.payload(application["reference"])
        name = " ".join(str(payload["full_name"]).split()).title()
        with self.runtime.sessions() as session:  # an earlier run that stopped may have created it already
            user = session.scalar(select(UserRecord).where(UserRecord.customer_id == customer_id))
            username = user.username if user else None
        if not username:
            username = _free_username(self.auth_service, name)
            try:
                self.auth_service.create_onboarded_profile(full_name=name, phone_number="+91" + str(payload["mobile"])[-10:],
                                                           username=username, customer_id=customer_id)
            except ValueError as exc:
                raise ApplicationError(f"Opened in the core, but the user id could not be created: {exc}") from exc
        return {"username": username, "failed": 0}

    # ---- activating online banking (new customers) -----------------------------------------------------------
    def check_activation(self, reference: str, username: str, date_of_birth: str) -> dict[str, Any]:
        """User id, application reference and date of birth must all match. Five wrong tries lock activation for 30
        minutes. Returns what the sign-in service needs to set the password."""
        refused = "These details do not match an account waiting to be activated."
        reference = (reference or "").strip().upper()
        if not REFERENCE.fullmatch(reference):
            raise ApplicationError(refused)
        error, login = None, None
        with self.db._lock, self.runtime.sessions.begin() as session:
            row = self._locked(session, reference, missing_ok=True)
            activation = dict(row.activation or {}) if row else {}
            now = utc_dt()
            if not row or row.status != "OPENED" or not activation.get("username"):
                error = refused
            elif activation.get("locked_until") and _aware(datetime.fromisoformat(activation["locked_until"].replace("Z", "+00:00"))) > now:
                error = "Too many wrong attempts. Try again after 30 minutes."
            else:
                payload = _unseal(row.payload_sealed)
                if not (hmac.compare_digest(activation["username"], (username or "").strip().lower())
                        and hmac.compare_digest(str(payload.get("date_of_birth", "")), (date_of_birth or "").strip())):
                    activation["failed"] = int(activation.get("failed", 0)) + 1
                    error = refused
                    if activation["failed"] >= ACTIVATION_TRIES:
                        activation.update(failed=0, locked_until=(now + ACTIVATION_LOCKOUT).isoformat())
                        error = "Too many wrong attempts. Try again after 30 minutes."
                        self.db._persist_audit(session, {
                            "id": f"AUD-{uuid.uuid4().hex}", "event_type": "ACCOUNT_ACTIVATION_LOCKED", "actor": "visitor",
                            "customer_id": row.customer_id, "approval_request_id": row.id,
                            "summary": f"{row.id}: online banking activation locked after {ACTIVATION_TRIES} wrong attempts",
                            "details": {}})
                    row.activation = activation
                elif activation.get("activated_at"):
                    error = "Online banking is already active. Sign in with your user id and password."
                else:
                    login = {"reference": row.id, "customer_id": row.customer_id, "username": activation["username"],
                             "full_name": " ".join(str(payload["full_name"]).split()).title(),
                             "mobile": "+91" + str(payload["mobile"])[-10:]}
        if error:  # raised after the commit, so a wrong try is counted
            raise ApplicationError(error)
        return login

    def activated(self, reference: str) -> None:
        """The password is set: activation is done and cannot be used again (a forgotten password goes to the bank)."""
        with self.db._lock, self.runtime.sessions.begin() as session:
            row = self._locked(session, reference)
            row.activation = {"username": (row.activation or {}).get("username"), "failed": 0,
                              "activated_at": utc_dt().isoformat()}
            self.db._persist_audit(session, {
                "id": f"AUD-{uuid.uuid4().hex}", "event_type": "ACCOUNT_ONLINE_BANKING_ACTIVATED", "actor": "customer",
                "customer_id": row.customer_id, "approval_request_id": row.id,
                "summary": f"{row.id}: the new customer set their password and activated online banking", "details": {}})

    def failed(self, reference: str, *, error: str, refused_by_core: bool = False) -> dict[str, Any]:
        """The robot could not finish (RPA_FAILED), or the core refused the entry (CBS_REJECTED). An officer retries or rejects."""
        target = "CBS_REJECTED" if refused_by_core else "RPA_FAILED"
        with self.db._lock, self.runtime.sessions.begin() as session:
            row = self._locked(session, reference)
            row.rpa = {**(row.rpa or {}), "last_error": str(error)[:500]}
            self._move(session, row, target, by="RPA", actor="rpa", note=str(error)[:200])
        return self.get(reference)

    def note_progress(self, reference: str, event: dict[str, Any], screenshot: Optional[str] = None) -> None:
        """One robot progress event (no screenshot in events), kept on the application for the officer; the last 40 are kept."""
        with self.db._lock, self.runtime.sessions.begin() as session:
            row = self._locked(session, reference, missing_ok=True)
            if row:
                events = [*((row.rpa or {}).get("events") or []), {**event, "at": utc_dt().isoformat()}][-40:]
                updated_rpa = {**(row.rpa or {}), "events": events}
                if screenshot:
                    updated_rpa["latest_screenshot"] = screenshot
                row.rpa = updated_rpa

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
                    AccountApplicationRecord.status.in_(["QUEUED_FOR_CBS", "RPA_EXECUTING", "RPA_FAILED"])).with_for_update()):
                if row.status == "RPA_FAILED":
                    last_err = str((row.rpa or {}).get("last_error") or "")
                    if "LEGACY_CBS_" not in last_err:
                        continue
                    self._move(session, row, "QUEUED_FOR_CBS", by="system", actor="system", note="Re-queued after legacy core credentials configured")
                elif row.status == "RPA_EXECUTING":
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

    def find(self, statuses: Optional[list[str]] = None, limit: int = 100, customer_id: Optional[str] = None) -> list[dict[str, Any]]:
        with self.runtime.sessions() as session:
            query = select(AccountApplicationRecord).order_by(AccountApplicationRecord.updated_at.desc()).limit(limit)
            if statuses:
                query = query.where(AccountApplicationRecord.status.in_(statuses))
            if customer_id:
                query = query.where(AccountApplicationRecord.customer_id == customer_id)
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
            if (row.activation or {}).get("username"):  # a new customer: their user id, and whether they have activated
                status.update(user_id=row.activation["username"], online_banking_active=bool(row.activation.get("activated_at")))
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

    def document(self, reference: str, document_id: str) -> tuple[bytes, str, str]:
        """(file, mime type, document type) of one uploaded document, decrypted, for the reviewing officer."""
        from document_processing import cipher
        with self.runtime.sessions() as session:
            row = session.get(ApplicationDocumentRecord, document_id)
            if not row or row.application_ref != reference:
                raise KeyError("Document not found")
            return cipher().decrypt(row.content_sealed.encode()), row.mime_type, row.document_type

    @staticmethod
    def _dict(row: AccountApplicationRecord, with_payload: bool) -> dict[str, Any]:
        data = {"reference": row.id, "product_id": row.product_id, "kind": row.kind, "track": row.track,
                "customer_id": row.customer_id, "user_id": row.user_id, "status": row.status, "documents": row.documents,
                "decision": row.decision, "kyc_verification": row.kyc_verification, "cbs": row.cbs, "rpa": row.rpa,
                "history": row.history, "reapplied_from": row.reapplied_from, "findings": row.findings or [],
                "activation": row.activation or {}, "created_at": row.created_at.isoformat(), "updated_at": row.updated_at.isoformat()}
        if with_payload:
            data["payload"] = _unseal(row.payload_sealed)
        return data


def _mask(number: Optional[str]) -> Optional[str]:
    return f"•••• {str(number)[-4:]}" if number else None


# ---- the savings form and its documents ----------------------------------------------------------------------------
STATES = ["Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
          "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
          "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
          "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh",
          "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"]
RELATIONSHIPS = ["SPOUSE", "FATHER", "MOTHER", "SON", "DAUGHTER", "BROTHER", "SISTER", "OTHER"]
ADDRESS_PROOFS = {"AADHAAR", "PASSPORT", "VOTER_ID", "DRIVING_LICENSE"}
# The legacy core's screens take only these characters; checking here means the robot never fails on them later.
_FORM_RULES = {
    "full_name": (r"[A-Za-z][A-Za-z .']{1,99}", "Enter your full name as on your PAN card (letters only)."),
    "date_of_birth": (r"\d{4}-\d{2}-\d{2}", "Enter your date of birth."),
    "mobile": (r"[6-9]\d{9}", "Enter a 10-digit Indian mobile number."),
    "email": (r"[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,}", "Enter a valid email address."),
    "pan_number": (r"[A-Z]{5}\d{4}[A-Z]", "Enter a valid PAN, for example ABCDE1234F."),
    "address": (r"[A-Za-z0-9 ,./#-]{5,200}", "Enter your address (letters, numbers and , . / # - only)."),
    "city": (r"[A-Za-z .]{2,50}", "Enter your city."),
    "pincode": (r"[1-9]\d{5}", "Enter a valid 6-digit PIN code."),
    "document_last4": (r"\d{4}", "Enter the last 4 digits of your Aadhaar."),
}


def clean_savings_form(fields: dict[str, Any]) -> dict[str, Any]:
    """The applicant's savings form, normalised and checked. Raises ApplicationError naming the first problem."""
    from datetime import date
    form = {key: " ".join(str(fields.get(key) or "").split()) for key in (*_FORM_RULES, "state", "nominee_name",
                                                                         "nominee_relationship")}
    form["pan_number"], form["email"] = form["pan_number"].upper(), form["email"].lower()
    form["mobile"] = re.sub(r"\D", "", form["mobile"])[-10:]
    for key, (pattern, message) in _FORM_RULES.items():
        if not re.fullmatch(pattern, form[key]):
            raise ApplicationError(message)
    try:
        born = date.fromisoformat(form["date_of_birth"])
    except ValueError as exc:
        raise ApplicationError("Enter your date of birth.") from exc
    today = date.today()
    age = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
    if not 18 <= age <= 100:
        raise ApplicationError("You must be 18 or older to open an account online.")
    if form["state"] not in STATES:
        raise ApplicationError("Choose your state.")
    if form["nominee_name"]:
        if not re.fullmatch(_FORM_RULES["full_name"][0], form["nominee_name"]) or form["nominee_relationship"] not in RELATIONSHIPS:
            raise ApplicationError("Enter the nominee's name and choose their relationship to you.")
    else:
        form["nominee_name"], form["nominee_relationship"] = "", ""
    if fields.get("declarations_accepted") is not True:
        raise ApplicationError("Confirm the declarations to continue.")
    return {**form, "declarations_accepted": True}


def read_documents(documents: list[dict[str, Any]], form: dict[str, Any], scanner=None) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Validate, OCR and compare each upload with the form. Returns (documents to store, findings for the officer).
    KYC first: a PAN card and one address proof are required. Findings never contain a full identifier."""
    import hashlib as _hashlib
    from document_processing import CloudDocumentScanner, basic_fields, cipher, validate_file
    types = [str(d.get("document_type", "")).upper() for d in documents]
    if len(documents) > 3 or "PAN" not in types or not ADDRESS_PROOFS & set(types):
        raise ApplicationError("Upload your PAN card and one address proof (Aadhaar, passport, voter ID or driving licence).")
    scanner = scanner or CloudDocumentScanner()
    stored, findings = [], []
    for upload, kind in zip(documents, types):
        if kind != "PAN" and kind not in ADDRESS_PROOFS:
            raise ApplicationError("Upload only a PAN card and an address proof.")
        try:
            raw, mime, pages = validate_file(str(upload.get("content_base64", "")), str(upload.get("mime_type", "")))
        except ValueError as exc:
            raise ApplicationError(f"{kind.replace('_', ' ').title()}: {exc}") from exc
        try:
            scan = scanner.scan(raw, mime, pages)
        except Exception:  # OCR unavailable: the officer checks the document by eye
            scan = {"status": "SCAN_UNAVAILABLE", "text": ""}
        found = basic_fields(scan.get("text", ""), kind)
        stored.append({"id": f"ADOC-{uuid.uuid4().hex[:16].upper()}", "document_type": kind, "mime_type": mime,
                       "sha256": _hashlib.sha256(raw).hexdigest(), "size_bytes": len(raw),
                       "content_sealed": cipher().encrypt(raw).decode(), "extracted_sealed": _seal(found),
                       "scan_status": scan.get("status", "SCAN_UNAVAILABLE"), "fields_found": sorted(k for k, v in found.items() if v)})
        findings += _compare(kind, found, form, scan.get("status"))
    return stored, findings


def _compare(kind: str, found: dict[str, Any], form: dict[str, Any], scan_status: Optional[str]) -> list[dict[str, Any]]:
    label = "PAN card" if kind == "PAN" else kind.replace("_", " ").title()
    if scan_status != "TEXT_EXTRACTED":
        return [{"code": f"{kind}_UNREADABLE", "status": "OFFICER_REVIEW",
                 "message": f"{label}: the bank's OCR could not read it; check the document yourself."}]
    checks = []

    def check(code: str, ok: bool, what: str, missing: bool = False) -> None:
        checks.append({"code": code, "status": "PASS" if ok else "OFFICER_REVIEW",
                       "message": f"{label}: {what} {'matches the form' if ok else 'not found on the document' if missing else 'differs from the form'}."})
    if kind == "PAN":
        check("PAN_NUMBER", found.get("pan_number") == form["pan_number"], "PAN", "pan_number" not in found)
        if found.get("full_name"):
            check("PAN_NAME", found["full_name"].upper() == form["full_name"].upper(), "name")
    if found.get("date_of_birth"):
        check(f"{kind}_DOB", found["date_of_birth"] == form["date_of_birth"], "date of birth")
    if kind in ADDRESS_PROOFS:
        check(f"{kind}_PINCODE", found.get("pincode") == form["pincode"], "PIN code", "pincode" not in found)
        if kind == "AADHAAR" and found.get("document_last4"):
            check("AADHAAR_LAST4", found["document_last4"] == form["document_last4"], "Aadhaar last 4 digits")
    return checks


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
