"""e-KYC / V-CIP: hand the customer to a KYC provider, accept only its signed result, then update KYC.

Provider (EKYC_PROVIDER):
  sandbox  default. A page served by this app, labelled SANDBOX everywhere, where the tester picks the outcome.
           Nothing is verified; the KYC profile records method "V-CIP (sandbox)". Refused when KOSH_ENV=production.
  vendor   a real V-CIP provider (e.g. IDfy, Signzy, HyperVerge). EKYC_API_URL + EKYC_API_KEY create a session
           (POST {EKYC_API_URL}/sessions -> {"id", "url"}); the provider calls POST /api/ekyc/webhook with the result,
           signed as hex HMAC-SHA256 of the raw body using EKYC_WEBHOOK_SECRET in the X-Ekyc-Signature header.
           Map the vendor's payload in _normalise() if it differs from the shape below.

Result shape: {"session_id", "status": COMPLETED|FAILED|ABANDONED, "checks": {aadhaar_verified, pan_verified,
liveness_passed, face_match_score, geo_in_india, agent_approved}, "agent_id", "video_ref"}.
KYC becomes VERIFIED only when every check passes (the V-CIP official's approval is the bank's decision under the
RBI KYC Master Direction); anything else leaves KYC unchanged and tells the customer.
"""

from __future__ import annotations

import hashlib
import hmac
import html
import json
import os
import secrets
import urllib.request
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from sqlalchemy import select

from backend.notifications import notify, phone_for
from banking_db import new_id, utc_now
from persistence import EkycSessionRecord, utc_dt

FACE_MATCH_MIN = 0.80
CHECKS = ("aadhaar_verified", "pan_verified", "liveness_passed", "geo_in_india", "agent_approved")
SANDBOX_OUTCOMES = {
    "pass": {"status": "COMPLETED", "checks": {**{c: True for c in CHECKS}, "face_match_score": 0.94}},
    "face_mismatch": {"status": "COMPLETED", "checks": {**{c: True for c in CHECKS}, "face_match_score": 0.41, "agent_approved": False}},
    "outside_india": {"status": "COMPLETED", "checks": {**{c: True for c in CHECKS}, "face_match_score": 0.93, "geo_in_india": False, "agent_approved": False}},
    "abandoned": {"status": "ABANDONED", "checks": {}},
}


def provider() -> str:
    return "vendor" if os.getenv("EKYC_PROVIDER", "sandbox").lower() == "vendor" else "sandbox"


def _secret() -> bytes:
    # ponytail: sandbox falls back to a per-process secret; a vendor must configure EKYC_WEBHOOK_SECRET
    return (os.getenv("EKYC_WEBHOOK_SECRET") or _SANDBOX_SECRET).encode()


_SANDBOX_SECRET = secrets.token_hex(32)


def sign(body: bytes) -> str:
    return hmac.new(_secret(), body, hashlib.sha256).hexdigest()


def _sha(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _public_url() -> str:
    return os.getenv("SENTINEL_PUBLIC_URL", "http://127.0.0.1:8019").rstrip("/")


def _vendor_session(session_id: str, customer: Dict[str, Any]) -> tuple[str, str]:
    body = json.dumps({"reference": session_id, "type": "VCIP", "customer": {"name": customer.get("display_name")},
                       "callback_url": f"{_public_url()}/api/ekyc/webhook", "redirect_url": f"{_public_url()}/#overview"}).encode()
    req = urllib.request.Request(os.environ["EKYC_API_URL"].rstrip("/") + "/sessions", data=body, method="POST",
                                 headers={"Authorization": f"Bearer {os.environ['EKYC_API_KEY']}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as res:
        data = json.loads(res.read())
    return data["id"], data["url"]


def _normalise(payload: Dict[str, Any]) -> Dict[str, Any]:
    checks = payload.get("checks") or {}
    return {"session_id": str(payload.get("session_id") or payload.get("reference") or ""),
            "status": str(payload.get("status", "")).upper(),
            "checks": {**{c: checks.get(c) is True for c in CHECKS}, "face_match_score": float(checks.get("face_match_score") or 0)},
            "agent_id": payload.get("agent_id"), "video_ref": payload.get("video_ref")}


def passed(result: Dict[str, Any]) -> bool:
    c = result["checks"]
    return result["status"] == "COMPLETED" and all(c.get(k) for k in CHECKS) and c.get("face_match_score", 0) >= FACE_MATCH_MIN


def start(db, customer_id: str) -> Dict[str, Any]:
    if provider() == "sandbox" and os.getenv("KOSH_ENV", "").lower() == "production":
        raise HTTPException(503, "Video KYC is not connected to a provider")
    kyc = db.get_kyc_profile(customer_id)
    if kyc.get("status") == "VERIFIED":
        raise HTTPException(409, "Your KYC is already verified")
    session_id, token = new_id("EKYC"), secrets.token_urlsafe(24)
    if provider() == "vendor":
        provider_ref, url = _vendor_session(session_id, db.get_customer(customer_id) or {})
    else:
        provider_ref, url = None, f"/ekyc/sandbox/{session_id}?token={token}"
    with db.runtime.sessions.begin() as s:
        s.add(EkycSessionRecord(id=session_id, customer_id=customer_id, provider=provider(), status="IN_PROGRESS",
                                token_hash=_sha(token), provider_ref=provider_ref, redirect_url=url))
    return {"session_id": session_id, "provider": provider(), "sandbox": provider() == "sandbox", "url": url}


def complete(db, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Apply one signed provider result exactly once."""
    result = _normalise(payload)
    with db.runtime.sessions.begin() as s:
        row = s.get(EkycSessionRecord, result["session_id"]) or s.scalar(
            select(EkycSessionRecord).where(EkycSessionRecord.provider_ref == result["session_id"]))
        if not row:
            raise HTTPException(404, "Unknown e-KYC session")
        if row.status != "IN_PROGRESS":
            return {"session_id": row.id, "status": row.status, "duplicate": True}
        ok = passed(result)
        row.status = "VERIFIED" if ok else ("ABANDONED" if result["status"] == "ABANDONED" else "NOT_VERIFIED")
        row.result, row.updated_at = result, utc_dt()
        session_id, customer_id, source = row.id, row.customer_id, row.provider
    method = "V-CIP (sandbox, not a real verification)" if source == "sandbox" else "V-CIP"
    if ok:
        db.update_kyc_status(customer_id, "VERIFIED")
        db.update_kyc_profile(customer_id, {"verification": {"method": method, "provider": source, "session_id": session_id,
                                                             "face_match_score": result["checks"]["face_match_score"],
                                                             "agent_id": result["agent_id"], "completed_at": utc_now()}})
    failed = [k for k in CHECKS if not result["checks"].get(k)]

    def audit(state):
        state.setdefault("audit_events", []).append({
            "id": new_id("AUD"), "event_type": "EKYC_VERIFIED" if ok else "EKYC_NOT_VERIFIED", "customer_id": customer_id,
            "actor": source, "created_at": utc_now(), "severity": "INFO" if ok else "WARNING",
            "summary": f"{method}: {'all checks passed' if ok else 'not verified (' + (', '.join(failed) or result['status'].lower()) + ')'}",
            "details": {"session_id": session_id, "checks": result["checks"]}})
    db.transaction(audit)
    if result["status"] != "ABANDONED":
        notify(db, "kyc_verified" if ok else "kyc_not_verified", phone_for(db, customer_id), customer_id=customer_id, reference=session_id)
    return {"session_id": session_id, "status": "VERIFIED" if ok else "NOT_VERIFIED", "failed_checks": failed}


def latest(db, customer_id: str) -> Optional[Dict[str, Any]]:
    with db.runtime.sessions() as s:
        row = s.scalar(select(EkycSessionRecord).where(EkycSessionRecord.customer_id == customer_id)
                       .order_by(EkycSessionRecord.created_at.desc()).limit(1))
        return row and {"session_id": row.id, "provider": row.provider, "status": row.status, "sandbox": row.provider == "sandbox",
                        "created_at": row.created_at.isoformat(), "failed_checks": [k for k in CHECKS if row.result and not row.result["checks"].get(k)]}


SANDBOX_PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8"><title>SANDBOX Video KYC · Kosh</title>
<meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{{font:16px system-ui,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#1b1b1b}}
.banner{{background:#b91c1c;color:#fff;padding:14px 16px;border-radius:10px;font-weight:700}}
ol li{{margin:6px 0}} button{{font:inherit;padding:12px 16px;margin:6px 6px 0 0;border-radius:10px;border:1px solid #888;cursor:pointer}}
.pass{{background:#166534;color:#fff;border-color:#166534}}</style></head><body>
<div class="banner" role="alert">SANDBOX · This is a test video-KYC provider. No identity is checked, no video is recorded,
and no data leaves this machine. Choose the outcome to simulate.</div>
<h1>Video KYC (V-CIP)</h1><p>Session <code>{session_id}</code></p>
<p>A real provider would now run, with your consent:</p>
<ol><li>Aadhaar offline e-KYC or DigiLocker (signed XML)</li><li>PAN verification with the Income Tax database</li>
<li>A live video call with a Kosh official: liveness, face match with Aadhaar photo, geo-tag inside India, random questions</li></ol>
<form method="post" action="/ekyc/sandbox/{session_id}"><input type="hidden" name="token" value="{token}">
<button class="pass" name="outcome" value="pass">Simulate: all checks pass</button>
<button name="outcome" value="face_mismatch">Simulate: face does not match</button>
<button name="outcome" value="outside_india">Simulate: customer outside India</button>
<button name="outcome" value="abandoned">Simulate: customer leaves the call</button></form></body></html>"""


def make_ekyc_router(db, customer, customer_csrf, limiter) -> APIRouter:
    router = APIRouter()

    @router.post("/api/portal/ekyc/sessions", status_code=201)
    @limiter.limit("5/hour")
    def start_session(request: Request, response: Response, context=Depends(customer_csrf)):
        del request, response
        return start(db, context.customer_id)

    @router.get("/api/portal/ekyc/sessions/latest")
    def latest_session(context=Depends(customer)):
        return {"session": latest(db, context.customer_id)}

    @router.post("/api/ekyc/webhook")
    @limiter.limit("60/minute")
    async def webhook(request: Request, response: Response):
        del response
        body = await request.body()
        if provider() != "vendor" or not os.getenv("EKYC_WEBHOOK_SECRET"):
            raise HTTPException(404, "Not found")
        if not hmac.compare_digest(sign(body), request.headers.get("X-Ekyc-Signature", "")):
            raise HTTPException(401, "Bad signature")
        return complete(db, json.loads(body))

    def _sandbox_row(session_id: str, token: str) -> EkycSessionRecord:
        with db.runtime.sessions() as s:
            row = s.get(EkycSessionRecord, session_id)
        if provider() != "sandbox" or not row or row.provider != "sandbox" or not hmac.compare_digest(row.token_hash, _sha(token)):
            raise HTTPException(404, "Not found")
        return row

    @router.get("/ekyc/sandbox/{session_id}", response_class=HTMLResponse)
    def sandbox_page(session_id: str, token: str = ""):
        row = _sandbox_row(session_id, token)
        if row.status != "IN_PROGRESS":
            return RedirectResponse("/#overview", status_code=303)
        return SANDBOX_PAGE.format(session_id=html.escape(session_id), token=html.escape(token))

    @router.post("/ekyc/sandbox/{session_id}")
    @limiter.limit("20/minute")
    def sandbox_submit(request: Request, session_id: str, token: str = Form(""), outcome: str = Form("")):
        del request
        _sandbox_row(session_id, token)
        if outcome not in SANDBOX_OUTCOMES:
            raise HTTPException(422, "Unknown outcome")
        complete(db, {"session_id": session_id, "agent_id": "SANDBOX-AGENT", "video_ref": None, **SANDBOX_OUTCOMES[outcome]})
        return RedirectResponse("/#overview", status_code=303)

    return router
