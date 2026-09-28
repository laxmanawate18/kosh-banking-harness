"""Authenticated retail banking HTTP workflows. Money moves only via Sentinel."""
from __future__ import annotations

import csv
import hashlib
import io
import json
import re
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import or_, select

from banking_db import new_id, utc_now
from persistence import (
    AuditEventRecord,
    AuthSessionRecord,
    ConversationRecord,
    ServiceRequestRecord,
    utc_dt,
)
from service_requests import CATALOGUE_BY_ID


class StrictBody(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class PaymentBody(StrictBody):
    request_key: str = Field(min_length=16, max_length=80, pattern=r"^[a-zA-Z0-9-]+$")
    action: Literal["TRANSFER", "PAY_BILL", "FREEZE_CARD"]
    source_account_id: str | None = None
    beneficiary_id: str | None = None
    bill_id: str | None = None
    card_id: str | None = None
    amount_minor: int = Field(default=0, ge=0, le=20000000, strict=True)
    note: str = Field(default="", max_length=120)


class BeneficiaryBody(StrictBody):
    display_name: str = Field(min_length=2, max_length=60, pattern=r"^[\w .'-]+$")
    upi_id: str = Field(min_length=5, max_length=80, pattern=r"^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$")


class ReplyBody(StrictBody):
    message: str = Field(min_length=5, max_length=2000)


class PreferenceBody(StrictBody):
    email_updates: bool
    payment_alerts: bool
    monthly_statement: bool


class ServiceBody(StrictBody):
    service_id: str
    data: dict[str, str | int] = Field(default_factory=dict)


def make_portal_router(db, banking, auth, requests, customer, customer_csrf, officer, consent, limiter):
    router = APIRouter(prefix="/api/portal")

    def audit(data, context, kind, summary):
        data.setdefault("audit_events", []).append({"id": new_id("AUD"), "event_type": kind,
            "customer_id": context.customer_id, "session_id": context.session_id,
            "actor": context.user_id, "created_at": utc_now(), "summary": summary,
            "severity": "INFO", "details": {}})

    @router.get("/overview")
    def overview(context=Depends(customer)):
        snapshot = db.snapshot()
        result = db.dashboard(context.customer_id)
        result["beneficiaries"] = [b for b in snapshot["beneficiaries"].values()
                                  if b["customer_id"] == context.customer_id]
        result["transactions"] = [t for t in snapshot["transactions"] if t["customer_id"] == context.customer_id]
        result["transactions"].sort(key=lambda t: t["created_at"], reverse=True)
        result["preferences"] = snapshot.get("preferences", {}).get(context.customer_id,
            {"email_updates": True, "payment_alerts": True, "monthly_statement": True})
        result["requests"] = requests.list_for_customer(context.customer_id)
        result["delegation"] = db.get_delegation(context.customer_id)
        result["kyc"] = db.get_kyc_profile(context.customer_id)
        return result

    @router.get("/events")
    def events(context=Depends(customer)):
        # Customer activity spans authenticated forms and owned agent conversations.
        # Single efficient query matching customer-owned events.
        with db.runtime.sessions() as session:
            sub_sessions = select(AuthSessionRecord.id).where(AuthSessionRecord.user_id == context.user_id).scalar_subquery()
            sub_convs = select(ConversationRecord.id).where(ConversationRecord.user_id == context.user_id).scalar_subquery()
            sub_reqs = select(ServiceRequestRecord.id).where(ServiceRequestRecord.customer_id == context.customer_id).scalar_subquery()
            stmt = (
                select(AuditEventRecord)
                .where(
                    or_(
                        AuditEventRecord.actor == context.user_id,
                        AuditEventRecord.session_id.in_(sub_sessions),
                        AuditEventRecord.session_id.in_(sub_convs),
                        AuditEventRecord.approval_request_id.in_(sub_reqs),
                    )
                )
                .order_by(AuditEventRecord.sequence.desc())
                .limit(100)
            )
            rows = session.scalars(stmt).all()
            visible = [{
                "id": row.event_id,
                "event_type": row.event_type,
                "summary": row.summary,
                "severity": row.severity,
                "created_at": row.created_at.isoformat().replace("+00:00", "Z"),
                "policy_version": row.policy_version,
                "details": {"reason_codes": (row.details or {}).get("reason_codes", [])},
            } for row in rows]
        return {"events": visible}

    @router.get("/statement.csv")
    def statement(account_id: str, start: date, end: date, context=Depends(customer)):
        account = db.get_account(account_id)
        if not account or account["customer_id"] != context.customer_id:
            raise HTTPException(404, "Account not found")
        if end < start or (end - start).days > 366:
            raise HTTPException(400, "Choose a valid date range of at most 366 days")
        stream = io.StringIO()
        writer = csv.writer(stream)
        writer.writerow(["Date", "Reference", "Description", "Debit INR", "Credit INR", "Status"])
        for t in sorted(db.snapshot()["transactions"], key=lambda item: item["created_at"]):
            if t["customer_id"] != context.customer_id or t["account_id"] != account_id:
                continue
            if not start.isoformat() <= t["created_at"][:10] <= end.isoformat():
                continue
            description = t["description"]
            if description.lstrip().startswith(("=", "+", "-", "@")):
                description = "'" + description
            amount = t["amount_minor"]
            writer.writerow([t["created_at"][:10], t.get("reference", t["id"]), description,
                             f"{abs(amount) / 100:.2f}" if amount < 0 else "",
                             f"{amount / 100:.2f}" if amount > 0 else "", t["status"]])
        return Response(stream.getvalue(), media_type="text/csv", headers={
            "Content-Disposition": f'attachment; filename="statement-{account_id}-{start}-{end}.csv"'})

    @router.post("/payments")
    def payment(body: PaymentBody, context=Depends(customer_csrf)):
        consent(context)
        for collection, identifier in [("accounts", body.source_account_id), ("beneficiaries", body.beneficiary_id),
                                        ("bills", body.bill_id), ("cards", body.card_id)]:
            if identifier:
                row = db.snapshot()[collection].get(identifier)
                if not row or row.get("customer_id") != context.customer_id:
                    raise HTTPException(404, "Banking record not found")
        if body.action == "TRANSFER" and (not body.source_account_id or not body.beneficiary_id or body.amount_minor <= 0):
            raise HTTPException(422, "Choose an account, beneficiary, and positive amount")
        if body.action == "PAY_BILL" and (not body.source_account_id or not body.bill_id):
            raise HTTPException(422, "Choose a bill and payment account")
        if body.action == "FREEZE_CARD" and not body.card_id:
            raise HTTPException(422, "Choose a card")
        # The authenticated form binds exact values directly, without parsing prose or using an LLM.
        payload = body.model_dump(exclude={"request_key"})
        digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
        key = f"{context.user_id}:{body.request_key}"

        def bind(data):
            existing = data.setdefault("portal_requests", {}).get(key)
            if existing:
                if existing["digest"] != digest:
                    raise HTTPException(409, "The request key was already used with different details")
                return existing
            fields = {k: v for k, v in payload.items() if v is not None}
            if body.bill_id:
                bill = data["bills"][body.bill_id]
                fields.update(biller_id=bill["biller_id"], amount_minor=bill["amount_minor"])
            intent = {"id": new_id("INT"), "customer_id": context.customer_id, "session_id": context.session_id,
                      "turn_id": body.request_key, "action_family": body.action, "fields": fields,
                      "raw_user_message_digest": digest, "status": "BOUND", "version": 1,
                      "created_at": utc_now(), "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()}
            data["intents"].append(intent)
            record = {"digest": digest, "intent": intent, "result": None}
            data["portal_requests"][key] = record
            audit(data, context, "INTENT_BOUND", f"Customer reviewed {body.action.lower().replace('_', ' ')} details")
            return record

        with banking._workflow_lock:
            record = db.transaction(bind)
            if record["result"] is not None:
                result = record["result"]
                challenge = result.get("challenge")
                if challenge:
                    stored = db.get_challenge(challenge["id"])
                    p = db.get_payment_intent(stored["payment_intent_id"]) if stored else None
                    if p and p.get("receipt"):
                        return {"success": True, "status": "EXECUTED", "receipt": p["receipt"]}
                return result
            sc = {"session_id": context.session_id, "turn_id": body.request_key, "intent": record["intent"]}
            if body.action == "TRANSFER":
                result = banking.propose_transfer(sc, body.beneficiary_id, body.amount_minor, body.source_account_id, body.note)
            elif body.action == "PAY_BILL":
                result = banking.propose_bill_payment(sc, body.bill_id, body.source_account_id)
            else:
                result = banking.freeze_card(sc, body.card_id, body.note or "Customer requested card protection")
            db.transaction(lambda data: data["portal_requests"][key].update(result=result))
            return result

    @router.post("/beneficiaries", status_code=201)
    def add_beneficiary(body: BeneficiaryBody, context=Depends(customer_csrf)):
        consent(context)
        if context.assurance_level != "L3":
            raise HTTPException(403, {"code": "STEP_UP_REQUIRED", "message": "Verify your identity before adding a payee"})
        def mutate(data):
            upi = body.upi_id.lower()
            if any(b.get("upi_id", "").lower() == upi for b in data["beneficiaries"].values()):
                raise HTTPException(409, "This UPI destination already exists. Use its saved beneficiary record.")
            row = {"id": new_id("BEN"), "customer_id": context.customer_id, "display_name": body.display_name,
                   "upi_id": upi, "destination_masked": f"UPI • {upi}", "kind": "PERSON", "relationship": "NEW",
                   "risk_status": "NORMAL", "created_at": utc_now()}
            data["beneficiaries"][row["id"]] = row
            audit(data, context, "BENEFICIARY_ADDED", f"New beneficiary saved: {body.display_name}")
            return row
        return db.transaction(mutate)

    @router.patch("/preferences")
    def preferences(body: PreferenceBody, context=Depends(customer_csrf)):
        def mutate(data):
            data.setdefault("preferences", {})[context.customer_id] = body.model_dump()
            audit(data, context, "PREFERENCES_UPDATED", "Notification preferences updated")
            return body.model_dump()
        return db.transaction(mutate)

    @router.post("/service-requests", status_code=201)
    def create_request(body: ServiceBody, context=Depends(customer_csrf)):
        if body.service_id == "P1-17":
            raise HTTPException(409, "KYC must use the document workflow and trusted review")
        permission = consent(context)
        service = CATALOGUE_BY_ID.get(body.service_id)
        if not service:
            raise HTTPException(404, "Unknown banking service")
        if service["auth_level"] == "L3" and context.assurance_level != "L3":
            raise HTTPException(403, {"code": "STEP_UP_REQUIRED", "message": "Verify your identity to submit this request"})
        fields = body.data
        if set(fields) & {"discrepancy_flags", "confidence_scores", "findings", "approver_id", "status", "customer_id", "auth_level"}:
            raise HTTPException(422, "Bank review metadata cannot be supplied by a customer")
        account = db.get_account(str(fields.get("account_id", "")))
        if not account or account["customer_id"] != context.customer_id:
            raise HTTPException(404, "Account not found")
        details = str(fields.get("details", "")).strip()
        if not 5 <= len(details) <= 2000 or len(fields) > 12 or any(len(str(v)) > 2000 for v in fields.values()):
            raise HTTPException(422, "Provide request details between 5 and 2000 characters")
        required = {"P1-04": ["leaves"], "P1-05": ["cheque_number"], "P1-06": ["cheque_number"],
                    "P1-11": ["email", "mobile"], "P1-12": ["new_address"], "P1-14": ["nominee_name", "relationship"],
                    "P1-19": ["amount_minor", "tenure_months"], "P1-20": ["amount_minor", "tenure_months"],
                    "P1-23": ["branch", "preferred_date", "preferred_window"]}.get(body.service_id, [])
        if any(not fields.get(k) for k in required):
            raise HTTPException(422, "Complete all required service fields")
        if body.service_id == "P1-04" and str(fields["leaves"]) not in {"25", "50"}:
            raise HTTPException(422, "Choose 25 or 50 cheque leaves")
        if body.service_id in {"P1-05", "P1-06"} and not re.fullmatch(r"[0-9]{6}", str(fields["cheque_number"])):
            raise HTTPException(422, "A cheque number must contain six digits")
        if body.service_id == "P1-11" and (not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", str(fields["email"]))
                or not re.fullmatch(r"[0-9]{10}", str(fields["mobile"]))):
            raise HTTPException(422, "Provide a valid email address and ten-digit mobile number")
        if body.service_id == "P1-12" and len(str(fields["new_address"]).strip()) < 10:
            raise HTTPException(422, "Provide a complete address")
        if body.service_id == "P1-14" and (len(str(fields["nominee_name"]).strip()) < 2
                or fields["relationship"] not in {"Spouse", "Parent", "Child", "Sibling", "Other"}):
            raise HTTPException(422, "Provide a nominee name and listed relationship")
        if body.service_id in {"P1-19", "P1-20"}:
            amount = fields.get("amount_minor")
            if type(amount) is not int or not 1 <= amount <= 20000000 or str(fields.get("tenure_months")) not in {"6", "12", "24", "36"}:
                raise HTTPException(422, "Choose a valid deposit amount and tenure")
        if body.service_id == "P1-23":
            try:
                preferred = date.fromisoformat(str(fields["preferred_date"]))
            except ValueError as exc:
                raise HTTPException(422, "Choose a valid appointment date") from exc
            if preferred <= date.today() or preferred > date.today() + timedelta(days=180):
                raise HTTPException(422, "Choose an appointment within the next 180 days")
            if fields["branch"] not in {"Mumbai Fort", "Mumbai Andheri", "Mumbai Bandra"}:
                raise HTTPException(422, "Choose a listed branch")
            if fields["preferred_window"] not in {"10:00–11:00", "11:00–12:00", "14:00–15:00", "15:00–16:00"}:
                raise HTTPException(422, "Choose a listed appointment window")
        return requests.create(customer_id=context.customer_id, user_id=context.user_id,
            service_id=body.service_id, data={**fields, "channel": "DIGITAL_BANKING"},
            consent_id=permission["id"], session_id=context.session_id)

    @router.get("/security/sessions")
    def sessions(context=Depends(customer)):
        with db.runtime.sessions() as session:
            rows = session.scalars(select(AuthSessionRecord).where(AuthSessionRecord.user_id == context.user_id,
                AuthSessionRecord.revoked_at.is_(None), AuthSessionRecord.expires_at > utc_dt())).all()
            return {"sessions": [{"id": r.id, "current": r.id == context.session_id,
                "created_at": r.created_at.isoformat(), "last_seen_at": r.last_seen_at.isoformat(),
                "assurance_level": r.assurance_level} for r in rows]}

    @router.delete("/security/sessions/{session_id}")
    def revoke_session(session_id: str, context=Depends(customer_csrf)):
        with db.runtime.sessions.begin() as session:
            row = session.get(AuthSessionRecord, session_id)
            if not row or row.user_id != context.user_id:
                raise HTTPException(404, "Session not found")
            row.revoked_at = utc_dt()
        db.append_audit("SESSION_REVOKED", actor=context.user_id, summary="Customer revoked a banking session")
        return {"revoked": True, "current": session_id == context.session_id}

    @router.post("/requests/{request_id}/reply")
    def reply(request_id: str, body: ReplyBody, context=Depends(customer_csrf)):
        consent(context)
        with db.runtime.sessions.begin() as session:
            row = session.execute(select(ServiceRequestRecord).where(ServiceRequestRecord.id == request_id).with_for_update()).scalar_one_or_none()
            if not row or row.customer_id != context.customer_id:
                raise HTTPException(404, "Request not found")
            if row.status != "MORE_INFO_REQUIRED":
                raise HTTPException(409, "This request is not awaiting more information")
            row.collected_data = {**row.collected_data, "customer_response": body.message}
            row.status = "PENDING_APPROVAL"
            row.updated_at = utc_dt()
        db.append_audit("CUSTOMER_RESPONSE", approval_request_id=request_id, actor=context.user_id, summary="Customer supplied additional information")
        return requests._dict(row)

    @router.post("/requests/{request_id}/cancel")
    def cancel(request_id: str, context=Depends(customer_csrf)):
        with db.runtime.sessions.begin() as session:
            row = session.execute(select(ServiceRequestRecord).where(ServiceRequestRecord.id == request_id).with_for_update()).scalar_one_or_none()
            if not row or row.customer_id != context.customer_id:
                raise HTTPException(404, "Request not found")
            if row.status not in {"SUBMITTED", "PENDING_APPROVAL", "MORE_INFO_REQUIRED"}:
                raise HTTPException(409, "This request can no longer be cancelled")
            row.status = "CANCELLED"
            row.updated_at = utc_dt()
        if row.service_id == "P1-17":
            cust_kyc = db.get_kyc_profile(row.customer_id)
            fallback_status = "NOT_DONE" if cust_kyc.get("kyc_type") == "INITIAL_KYC" else "PENDING_RE_KYC"
            db.update_kyc_profile(row.customer_id, {
                "status": fallback_status,
                "pending_request_id": None,
            })
        db.append_audit("REQUEST_CANCELLED", approval_request_id=request_id, actor=context.user_id, summary="Customer cancelled a service request")
        return requests._dict(row)

    @router.get("/operations")
    def operations(context=Depends(officer)):
        with db.runtime.sessions() as session:
            rows = session.scalars(select(ServiceRequestRecord).order_by(ServiceRequestRecord.updated_at.desc()).limit(250)).all()
            return {"requests": [requests._dict(row) for row in rows], "events": db.get_audit_events(limit=100)}

    return router
