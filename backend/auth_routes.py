"""Authentication, consent, demo-control, and approval-challenge routes."""

from __future__ import annotations

import asyncio
import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse

from backend.api_models import (
    ChallengeVerifyRequest,
    ConsentRequest,
    GCPPhoneLoginRequest,
    StepUpRequest,
)
from backend.settings import DEFAULT_MODEL
from auth_service import COOKIE_NAME, TERMS_VERSION
from sentinel import AGENT_ID, DEMO_OTP


def make_auth_router(
    db,
    banking_service,
    auth_service,
    limiter,
    require_auth,
    require_csrf,
    require_customer,
    require_customer_csrf,
    active_consent,
    oauth_service=None,
):
    router = APIRouter()

    @router.get("/api/auth/session")
    async def auth_session(
        sentinel_session: Optional[str] = Cookie(default=None, alias=COOKIE_NAME),
        context=Depends(require_auth),
    ):
        result = context.safe_dict()
        result.update(
            csrf_token=auth_service.rotate_csrf(sentinel_session) if sentinel_session else None,
            consent=auth_service.active_consent(context.customer_id),
        )
        return result

    @router.post("/api/auth/logout")
    async def logout(
        response: Response,
        sentinel_session: Optional[str] = Cookie(default=None, alias=COOKIE_NAME),
    ):
        if sentinel_session:
            try:
                context = auth_service.resolve(sentinel_session)
                if context and oauth_service is not None:
                    await asyncio.to_thread(oauth_service.revoke_session_grants, context.session_id)
            except Exception:
                pass
            try:
                auth_service.revoke(sentinel_session)
            except Exception:
                pass
        response.delete_cookie(COOKIE_NAME, path="/")
        idp_sign_out = oauth_service.idp_sign_out_url("/") if oauth_service else None
        return {"logged_out": True, "idp_sign_out_url": idp_sign_out}

    @router.get("/api/auth/logout")
    async def logout_get(
        sentinel_session: Optional[str] = Cookie(default=None, alias=COOKIE_NAME),
    ):
        if sentinel_session:
            try:
                context = auth_service.resolve(sentinel_session)
                if context and oauth_service is not None:
                    await asyncio.to_thread(oauth_service.revoke_session_grants, context.session_id)
            except Exception:
                pass
            try:
                auth_service.revoke(sentinel_session)
            except Exception:
                pass
        idp_sign_out = oauth_service.idp_sign_out_url("/") if oauth_service else "/"
        redirect_res = RedirectResponse(url=idp_sign_out or "/", status_code=302)
        redirect_res.delete_cookie(COOKIE_NAME, path="/")
        return redirect_res

    @router.post("/api/auth/firebase-step-up")
    @limiter.limit("10/minute")
    async def firebase_step_up(
        request: Request,
        req: GCPPhoneLoginRequest,
        context=Depends(require_customer_csrf),
    ):
        del request
        if oauth_service is None or context.auth_source != "oidc":
            raise HTTPException(status_code=404, detail="OIDC step-up is not available")
        if context.client_id != oauth_service.web_client_id:
            raise HTTPException(status_code=403, detail="Step-up is restricted to the first-party Kosh client")
        try:
            expires_in = await asyncio.to_thread(
                oauth_service.step_up_with_firebase, context.session_id, req.id_token
            )
        except ConnectionError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except PermissionError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc
        db.append_audit(
            "STEP_UP_SUCCEEDED",
            actor="customer",
            session_id=context.session_id,
            summary="Firebase reauthentication upgraded the OAuth session to L3",
            details={"user_id": context.user_id, "assurance": "L3", "expires_in_seconds": expires_in},
        )
        return {"verified": True, "assurance_level": "L3", "expires_in_seconds": expires_in}

    @router.post("/api/auth/step-up")
    @limiter.limit("10/minute")
    async def step_up(
        request: Request,
        response: Response,
        req: StepUpRequest,
        context=Depends(require_customer_csrf),
    ):
        del request, response
        verified, attempts = auth_service.verify_step_up(context.session_id, req.code, DEMO_OTP)
        if not verified:
            db.append_audit(
                "STEP_UP_FAILED",
                actor="customer",
                severity="WARNING",
                summary="Customer step-up verification failed",
                details={"attempts_remaining": attempts},
            )
            raise HTTPException(status_code=401, detail={"code": "INVALID_STEP_UP", "attempts_remaining": attempts})
        db.append_audit(
            "STEP_UP_SUCCEEDED",
            actor="customer",
            summary="Customer assurance upgraded to L3",
            details={"user_id": context.user_id, "assurance": "L3", "expires_in_seconds": 900},
        )
        return {"verified": True, "assurance_level": "L3", "expires_in_seconds": 900}

    @router.post("/api/consent")
    async def capture_consent(req: ConsentRequest, context=Depends(require_customer_csrf)):
        if not req.accepted:
            raise HTTPException(status_code=400, detail="Consent must be explicitly accepted")
        consent = auth_service.capture_consent(context.customer_id or "", req.scope)
        db.append_audit(
            "CONSENT_CAPTURED",
            actor="customer",
            consent_id=consent["id"],
            summary="Digital banking consent captured",
            details={"terms_version": TERMS_VERSION, "scope": consent["scope"], "user_id": context.user_id},
        )
        return consent

    @router.delete("/api/consent")
    async def revoke_consent(context=Depends(require_customer_csrf)):
        changed = auth_service.revoke_consent(context.customer_id or "")
        db.append_audit(
            "CONSENT_REVOKED",
            actor="customer",
            summary="Digital banking consent revoked",
            details={"user_id": context.user_id},
        )
        return {"revoked": changed}

    @router.get("/api/dashboard")
    async def get_dashboard(context=Depends(require_customer)):
        return db.dashboard(context.customer_id)

    @router.get("/api/sentinel/events")
    async def get_sentinel_events(session_id: Optional[str] = Query(default=None), context=Depends(require_auth)):
        if context.role != "OFFICER" and not session_id:
            return {"events": [], "policy_version": db.snapshot()["policy_config"]["version"]}
        if session_id and context.role != "OFFICER":
            conversation = db.get_conversation(session_id)
            if not conversation or conversation.get("user_id") != context.user_id:
                raise HTTPException(status_code=404, detail="Session not found")
        return {
            "events": db.get_audit_events(session_id=session_id),
            "policy_version": db.snapshot()["policy_config"]["version"],
        }

    @router.get("/api/demo/config")
    async def get_demo_config(context=Depends(require_auth)):
        del context
        scenarios = db.snapshot().get("demo_scenarios", {})
        return {
            "simulated": True,
            "demo_otp": DEMO_OTP,
            "model": DEFAULT_MODEL,
            "agent_id": AGENT_ID,
            "scenarios": [{"id": key, "label": value.get("label", key)} for key, value in scenarios.items()],
        }

    @router.post("/api/demo/reset")
    async def reset_demo(context=Depends(require_customer_csrf)):
        db.reset_to_seed()
        db.append_audit(
            "DEMO_RESET",
            actor="customer",
            summary="Deterministic demo banking state restored",
            details={"user_id": context.user_id},
        )
        return {"reset": True, "dashboard": banking_service.dashboard()}

    @router.post("/api/portal/kyc/reset")
    async def reset_customer_kyc_endpoint(context=Depends(require_customer_csrf)):
        customer_id = context.customer_id or "CUST-1001"
        result = db.reset_kyc(customer_id)
        db.append_audit(
            "KYC_RESET",
            actor="customer",
            summary=f"KYC status reset to NOT_DONE for customer {customer_id}",
            details={"customer_id": customer_id, "user_id": context.user_id},
        )
        return {"success": True, "kyc": result}

    @router.post("/api/demo/replay/{scenario_id}")
    async def replay_demo(
        scenario_id: str,
        session_id: Optional[str] = Query(default=None),
        context=Depends(require_customer_csrf),
    ):
        active_consent(context)
        conversation = db.get_conversation(session_id or "")
        if not conversation or conversation.get("user_id") != context.user_id:
            raise HTTPException(status_code=404, detail="Session not found")
        try:
            return banking_service.replay_scenario(
                scenario_id,
                session_id=session_id or "",
                customer_id=context.customer_id,
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @router.post("/api/challenges/{challenge_id}/verify")
    async def verify_challenge(
        challenge_id: str,
        req: ChallengeVerifyRequest,
        context=Depends(require_customer_csrf),
    ):
        if (
            oauth_service is not None
            and context.client_id != oauth_service.web_client_id
        ):
            raise HTTPException(status_code=403, detail={
                "code": "FIRST_PARTY_APPROVAL_REQUIRED",
                "message": "Final execution must be approved inside Kavach.",
                "approval_deep_link": f"/approvals/{challenge_id}",
            })
        if context.auth_source != "oidc" or context.assurance_level != "L3":
            raise HTTPException(status_code=403, detail={
                "code": "STEP_UP_REQUIRED",
                "message": "Fresh Firebase verification is required before payment execution.",
            })
        consent = active_consent(context)
        try:
            challenge = db.get_challenge(challenge_id)
            payment = db.get_payment_intent(challenge["payment_intent_id"]) if challenge else None
            if not payment or payment.get("customer_id") != context.customer_id:
                raise HTTPException(404, "Challenge not found")
            if challenge.get("status") != "OPEN":
                return banking_service.approve_challenge(challenge_id, req.transaction_digest)
            if datetime.now(timezone.utc) >= datetime.fromisoformat(challenge["expires_at"].replace("Z", "+00:00")):
                return banking_service.approve_challenge(challenge_id, req.transaction_digest)

            expected_digest = challenge.get("request_digest") or challenge.get("transaction_digest", "")
            if not secrets.compare_digest(expected_digest, req.transaction_digest):
                return banking_service.approve_challenge(challenge_id, req.transaction_digest)
            result = banking_service.approve_challenge(challenge_id, req.transaction_digest)
            if result.get("success"):
                db.append_audit(
                    "STEP_UP_SUCCEEDED",
                    actor="customer",
                    consent_id=consent["id"],
                    summary="Transaction-bound step-up verified",
                    details={"challenge_id": challenge_id, "assurance": "L3"},
                )
            return result
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except (PermissionError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    return router
