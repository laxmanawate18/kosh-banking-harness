"""Authentication, consent, demo-control, and approval-challenge routes."""

from __future__ import annotations

import asyncio
import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response

from backend.api_models import (
    ChallengeVerifyRequest,
    ConsentRequest,
    GCPPhoneLoginRequest,
)
from auth_service import COOKIE_NAME, TERMS_VERSION



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
    oauth_service,
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
                if context:
                    await asyncio.to_thread(oauth_service.revoke_session_grants, context.session_id)
            except Exception:
                pass
            try:
                auth_service.revoke(sentinel_session)
            except Exception:
                pass
        response.delete_cookie(COOKIE_NAME, path="/")
        idp_sign_out = oauth_service.idp_sign_out_url("/")
        return {"logged_out": True, "idp_sign_out_url": idp_sign_out}

    @router.post("/api/auth/firebase-step-up")
    @limiter.limit("10/minute")
    async def firebase_step_up(
        request: Request,
        response: Response,
        req: GCPPhoneLoginRequest,
        context=Depends(require_customer_csrf),
    ):
        del request, response  # slowapi injects rate-limit headers into `response`
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

    @router.post("/api/challenges/{challenge_id}/verify")
    async def verify_challenge(
        challenge_id: str,
        req: ChallengeVerifyRequest,
        context=Depends(require_customer_csrf),
    ):
        if context.client_id != oauth_service.web_client_id:
            raise HTTPException(status_code=403, detail={
                "code": "FIRST_PARTY_APPROVAL_REQUIRED",
                "message": "Final execution must be approved inside Kavach.",
                "approval_deep_link": f"/approvals/{challenge_id}",
            })
        if context.assurance_level != "L3":
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
