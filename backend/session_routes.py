import json
import asyncio
import logging
import os
import re
import secrets
import urllib.request
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from backend.api_models import ApprovalDecisionRequest, OfficerCopilotRequest, SessionCreateRequest, SessionUpdateRequest
from backend.conversations import create_session_data, list_sessions_metadata, load_session, sanitized_session, save_session
from backend import care, mitra_ops
from backend.offers import funnel as offer_funnel
from backend.notifications import notify, recent as recent_notifications
from persistence import UserRecord, utc_dt
from product_service import get_product_by_id
from service_requests import SERVICE_CATALOGUE

logger = logging.getLogger(__name__)


AUTH_INTERNAL_TOKEN = os.getenv("AUTH_INTERNAL_TOKEN", "kosh-internal-development-token")


def _auth_server(path: str, payload: dict) -> bool:
    """Call a Better Auth internal endpoint with the shared service token. Returns success."""
    auth_base = os.environ.get("BETTER_AUTH_URL", "http://127.0.0.1:8020").rstrip("/")
    req = urllib.request.Request(
        f"{auth_base}/api/internal/{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "X-Kosh-Internal-Token": AUTH_INTERNAL_TOKEN},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=5):
            return True
    except Exception as e:
        logger.warning("Auth server %s failed: %s", path, e)
        return False


def _temp_password() -> str:
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*"
    return "Kosh!" + "".join(secrets.choice(chars) for _ in range(9))


def _free_username(auth_service, full_name: str, requested: str | None = None) -> str:
    """Never hand an applicant an existing login: a taken name gets a fresh generated one."""
    if requested and not auth_service.username_exists(requested):
        return requested
    first = re.sub(r"[^a-z0-9]", "", (full_name.lower().split() or ["user"])[0]) or "user"
    while True:
        candidate = f"{first}{uuid.uuid4().hex[:4]}"
        if not auth_service.username_exists(candidate):
            return candidate


def make_session_router(
    db,
    request_service,
    require_auth,
    require_csrf,
    require_customer,
    require_customer_csrf,
    require_officer,
    active_consent,
    auth_service,
    agent_factory=None,
):
    router = APIRouter()

    @router.get("/api/sessions")
    async def get_sessions(context=Depends(require_auth)):
        return list_sessions_metadata(context.user_id)

    @router.post("/api/sessions")
    async def create_session(req: SessionCreateRequest, context=Depends(require_csrf)):
        return sanitized_session(create_session_data(
            title=req.title or "New Chat",
            user_id=context.user_id,
            customer_id=context.customer_id,
            initial_messages=req.messages,
        ))

    @router.get("/api/sessions/{session_id}")
    async def get_session_detail(session_id: str, context=Depends(require_auth)):
        session = load_session(session_id)
        if not session or (context.role != "OFFICER" and session.get("user_id") != context.user_id):
            raise HTTPException(status_code=404, detail="Session not found")
        return sanitized_session(session)

    @router.patch("/api/sessions/{session_id}")
    async def update_session_detail(session_id: str, req: SessionUpdateRequest, context=Depends(require_csrf)):
        session = load_session(session_id)
        if not session or (context.role != "OFFICER" and session.get("user_id") != context.user_id):
            raise HTTPException(status_code=404, detail="Session not found")
        if req.title is not None:
            session["title"] = req.title.strip() or "Untitled Chat"
        save_session(session)
        return sanitized_session(session)

    @router.delete("/api/sessions/{session_id}")
    async def delete_session_endpoint(session_id: str, context=Depends(require_csrf)):
        if not db.delete_conversation(session_id, None if context.role == "OFFICER" else context.user_id):
            raise HTTPException(status_code=404, detail="Session not found")
        return {"deleted": True, "id": session_id}

    @router.get("/api/services")
    async def get_services(context=Depends(require_auth)):
        del context
        return {"services": SERVICE_CATALOGUE}

    @router.post("/api/officer/requests/{request_id}/decision")
    async def officer_decision(request_id: str, req: ApprovalDecisionRequest, context=Depends(require_csrf)):
        require_officer(context)
        try:
            return request_service.decide(
                request_id,
                officer_user_id=context.user_id,
                action=req.action,
                reason=req.reason,
                override_justification=req.override_justification,
                verification_checks=req.verification_checks,
                verification_reference=req.verification_reference,
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @router.get("/api/officer/requests/{request_id}/rpa")
    async def officer_rpa_status(request_id: str, context=Depends(require_officer)):
        del context
        request = request_service.get(request_id)
        if not request:
            raise HTTPException(status_code=404, detail="Request not found")
        if request.get("service_id") != "P1-25":
            raise HTTPException(status_code=400, detail="This request does not use account-opening RPA")
        return request

    @router.get("/api/officer/leads")
    async def get_officer_leads(status: str = None, context=Depends(require_officer)):
        del context
        return {"leads": db.list_leads(status=status, limit=100)}

    @router.post("/api/officer/leads/{lead_id}/status")
    async def update_lead_status_endpoint(lead_id: str, req: dict, context=Depends(require_csrf)):
        require_officer(context)
        status = req.get("status")
        notes = req.get("notes")
        if not status:
            raise HTTPException(status_code=400, detail="Status is required")
        res = db.update_lead_status(lead_id, status, notes=notes)
        if not res:
            raise HTTPException(status_code=404, detail="Lead not found")
        prefs = (res.get("preferences") or {})
        if status == "REJECTED" and prefs.get("app_ref"):
            notify(db, "application_rejected", prefs.get("phone_number"), reference=prefs["app_ref"])
        return res

    @router.post("/api/leads/{lead_id}/action")
    async def customer_lead_action(lead_id: str, req: dict, context=Depends(require_auth)):
        action = req.get("action", "INTERESTED")
        status_map = {
            "INTERESTED": "INTERESTED",
            "APPLY": "APPLIED",
            "DECLINE": "DECLINED",
        }
        target_status = status_map.get(str(action).upper(), "INTERESTED")
        lead = db.get_lead(lead_id)
        if not lead or lead.get("customer_id") != context.customer_id:
            raise HTTPException(status_code=404, detail="Lead not found")
        res = db.update_lead_status(lead_id, target_status, notes=f"Customer selected: {action}")
        return {"success": True, "lead": res}

    @router.post("/api/officer/leads/{lead_id}/approve")
    async def approve_lead_endpoint(lead_id: str, req: dict = None, context=Depends(require_csrf)):
        require_officer(context)
        lead = db.get_lead(lead_id)
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")
        if lead.get("customer_id") and lead.get("status") in ("APPROVED", "CONVERTED"):
            raise HTTPException(status_code=400, detail="This application has already been approved and provisioned.")

        pref = lead.get("preferences") or {}
        full_name = pref.get("applicant_name") or "Valued Customer"
        phone = pref.get("phone_number") or ""
        email = pref.get("email") or ""
        if not email or "@" not in email:
            email = (req or {}).get("email") or pref.get("email") or ""
            if not email or "@" not in email:
                raise HTTPException(status_code=422, detail="A valid recipient email address is required to dispatch credentials.")

        product_id = lead.get("recommended_product_id") or "PROD-SAV-PREMIER"
        product = get_product_by_id(product_id)
        if not product:
            product = {
                "id": product_id,
                "title": lead.get("sub_type") or "Kosh Suvarna Account",
                "category": (lead.get("category") or "SAVINGS").lower(),
                "headline_rate": "7.20% p.a.",
            }

        username = _free_username(auth_service, full_name, pref.get("requested_username"))
        temp_password = _temp_password()

        onboarded = db.onboard_customer_with_product(
            product=product,
            full_name=full_name,
            phone_number=phone,
            username=username,
            email=email,
        )
        customer_id = onboarded["customer_id"]
        try:
            auth_service.create_onboarded_profile(
                full_name=full_name,
                phone_number=phone,
                username=username,
                customer_id=customer_id,
            )
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        if not _auth_server("provision-user", {"name": full_name, "email": email, "username": username,
                                               "password": temp_password, "sentinelUserId": customer_id, "phoneNumber": phone}):
            raise HTTPException(status_code=502, detail="Sign-in credentials could not be provisioned. No email was sent; please retry.")

        notify(db, "application_approved", phone, customer_id=customer_id, reference=pref.get("app_ref"),
               product=product.get("title", "Kosh"), email=email[:2] + "•••@" + email.partition("@")[2])
        email_status = "NOT_SENT"  # Kosh sends no e-mail; the officer hands the login to the customer

        db.update_lead_status(
            lead_id=lead_id,
            status="CONVERTED",
            customer_id=customer_id,
            notes=f"Approved by officer {context.username}. Login handed over by the officer; no e-mail is sent.",
            preferences={
                "delivery_status": email_status,
                "approved_by": context.username,
                "provisioned_username": username,
                "approved_at": utc_dt().isoformat(),
                "email": email,
            },
        )

        db.append_audit(
            "OFFICER_APPROVED_CREDENTIALS_DISPATCHED",
            actor=context.username,
            summary=f"Officer approved application {lead_id} for {full_name}; credentials sent to {email}",
            details={
                "lead_id": lead_id,
                "customer_id": customer_id,
                "product_id": product_id,
                "email": email,
                "delivery_status": email_status,
            },
        )

        return {
            "success": True,
            "message": "Application approved. Give the customer this login in person; Kosh sends no e-mail.",
            "lead_id": lead_id,
            "customer_id": customer_id,
            "username": username,
            "temp_password": temp_password,  # shown once to the officer (officer-only endpoint)
            "delivery_status": email_status,
            "email_sent_to": email,
            "account_number": onboarded.get("account_number"),
        }

    @router.get("/api/officer/notifications")
    async def officer_notifications(context=Depends(require_officer)):
        del context
        return {"notifications": recent_notifications(db)}

    @router.post("/api/officer/copilot")
    async def officer_copilot(req: OfficerCopilotRequest, context=Depends(require_csrf)):
        require_officer(context)
        from backend import officer_copilot as copilot
        from backend.chat_runtime import over_rate_limit
        if mitra_ops.mitra_paused(db, "OFFICER"):  # the kill switch, or an unapproved prompt version in production
            raise HTTPException(status_code=503, detail="The officer copilot is paused by the bank.")
        if over_rate_limit(f"officer:{context.user_id}"):
            raise HTTPException(status_code=429, detail="Too many questions; wait a minute.")

        if req.stream:
            from fastapi.responses import StreamingResponse

            async def event_generator():
                try:
                    async for ev in copilot.ask_stream(
                        agent_factory, db, request_service, officer_user_id=context.user_id, message=req.message,
                        history=[m.model_dump() for m in req.history], request_id=req.request_id,
                    ):
                        yield f"data: {json.dumps(ev)}\n\n"
                    yield "data: [DONE]\n\n"
                except Exception as exc:
                    logger.exception("Officer copilot stream error: %r", exc)
                    yield f"data: {json.dumps({'type': 'error', 'message': 'The copilot could not answer right now.'})}\n\n"

            return StreamingResponse(event_generator(), media_type="text/event-stream")

        try:
            return await copilot.ask(agent_factory, db, request_service, officer_user_id=context.user_id, message=req.message,
                                     history=[m.model_dump() for m in req.history], request_id=req.request_id)
        except (asyncio.TimeoutError, TimeoutError):
            raise HTTPException(status_code=504, detail="The copilot did not answer in time; try again.")
        except Exception:
            logger.exception("Officer copilot failed")
            raise HTTPException(status_code=502, detail="The copilot could not answer right now.")

    @router.post("/api/officer/reconciliation/run")
    async def officer_run_reconciliation(context=Depends(require_csrf)):
        require_officer(context)
        from core_banking import reconcile
        from banking_tools import banking_service
        return await asyncio.to_thread(reconcile, db, banking_service.core)

    @router.get("/api/officer/care-cases")
    async def officer_care_cases(status: str = None, context=Depends(require_officer)):
        del context
        return {"cases": care.list_cases(db, status=status)}

    @router.post("/api/officer/care-cases/{case_id}")
    async def officer_update_care_case(case_id: str, req: dict, context=Depends(require_csrf)):
        require_officer(context)
        try:
            row = care.update_case(db, case_id, str(req.get("status", "")).upper(), req.get("resolution"))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        if not row:
            raise HTTPException(status_code=404, detail="Case not found")
        return row

    @router.get("/api/officer/offers/funnel")
    async def officer_offer_funnel(days: int = 30, context=Depends(require_officer)):
        del context
        return offer_funnel(db, max(1, min(days, 365)))

    @router.get("/api/officer/customers")
    async def get_officer_customers(context=Depends(require_officer)):
        del context
        return {"customers": db.list_customers_summary()}

    @router.post("/api/officer/customers/{customer_id}/deletion-request")
    async def request_customer_deletion(customer_id: str, req: dict, context=Depends(require_csrf)):
        """An officer asks; an admin decides in the Admin Panel (two people). Nothing is removed yet."""
        require_officer(context)
        reason = str(req.get("reason", "")).strip()[:500]
        if len(reason) < 10:
            raise HTTPException(status_code=400, detail="Give the reason for the deletion (at least 10 characters)")
        if not db.get_customer(customer_id):
            raise HTTPException(status_code=404, detail="Customer not found")
        from persistence import CustomerDeletionRecord
        with db.runtime.sessions.begin() as session:
            if session.scalar(select(CustomerDeletionRecord.id).where(CustomerDeletionRecord.customer_id == customer_id,
                                                                      CustomerDeletionRecord.status == "PENDING")):
                raise HTTPException(status_code=409, detail="A deletion request for this customer is already waiting for approval")
            request_id = f"DEL-{uuid.uuid4().hex[:10].upper()}"
            session.add(CustomerDeletionRecord(id=request_id, customer_id=customer_id, status="PENDING",
                                               requested_by=context.user_id, reason=reason))
        db.append_audit("CUSTOMER_DELETION_REQUESTED", actor="officer", approval_request_id=request_id, customer_id=customer_id,
                        summary="Officer requested removal of a customer's access and contact details", details={"request": request_id})
        return {"id": request_id, "status": "PENDING", "message": "Sent to the admin for approval. Nothing is removed until then."}

    @router.post("/api/officer/customers/{customer_id}/resend-credentials")
    async def resend_customer_credentials(customer_id: str, context=Depends(require_officer)):
        cust = db.get_customer(customer_id)
        if not cust:
            raise HTTPException(status_code=404, detail="Customer not found")
        if cust.get("access_removed_at"):
            raise HTTPException(status_code=409, detail="This customer's access was removed; a new login needs a new onboarding")

        temp_password = _temp_password()
        full_name = cust.get("display_name") or cust.get("full_name") or f"{cust.get('first_name', '')} {cust.get('last_name', '')}".strip() or "Valued Customer"
        phone = cust.get("phone_number") or ""
        email = cust.get("email") or f"{customer_id.lower()}@example.test"

        with auth_service.runtime.sessions() as session:
            user = session.scalar(select(UserRecord).where(UserRecord.customer_id == customer_id))
            username = user.username if user else None
            phone = (user.phone_number if user else None) or phone
            full_name = (user.display_name if user else None) or full_name
        if not username:
            username = _free_username(auth_service, full_name)
            auth_service.create_onboarded_profile(full_name=full_name, phone_number=phone, username=username, customer_id=customer_id)

        if not _auth_server("provision-user", {"name": full_name, "email": email, "username": username,
                                               "password": temp_password, "sentinelUserId": customer_id, "phoneNumber": phone}):
            raise HTTPException(status_code=502, detail="Sign-in credentials could not be re-issued. No email was sent; please retry.")

        email_status = "NOT_SENT"  # Kosh sends no e-mail; the officer hands the login to the customer

        db.append_audit(
            "OFFICER_RESENT_CREDENTIALS",
            actor=context.username,
            summary=f"Officer {context.username} regenerated Net Banking credentials for customer {customer_id} ({username}); handed over in person",
            details={
                "customer_id": customer_id,
                "username": username,
                "email": email,
                "delivery_status": email_status,
            },
        )

        return {
            "success": True,
            "message": "Fresh credentials generated. Give the customer this login in person; Kosh sends no e-mail.",
            "customer_id": customer_id,
            "username": username,
            "temp_password": temp_password,  # shown once to the officer (officer-only endpoint)
            "email": email,
            "delivery_status": email_status,
        }

    return router
