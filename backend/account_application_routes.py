"""Officer review of account applications: the queue, one application in full, approve or reject with a reason the
applicant will see, retry the core-banking robot, and watch it work. Officers only; every opened application is audited."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from account_applications import KYC_CHECKS, ApplicationError

REVIEW = ["SUBMITTED"]
NEEDS_OFFICER = ["SUBMITTED", "RPA_FAILED", "CBS_REJECTED"]
IN_CORE = ["QUEUED_FOR_CBS", "RPA_EXECUTING", "CBS_MAKER_DONE", "CBS_AUTHORISED"]
DONE = ["OPENED", "REJECTED"]


class ApplicationDecision(BaseModel):
    action: str = Field(pattern="^(APPROVE|REJECT)$")
    reason: str = Field(min_length=10, max_length=500)
    kyc_checks: list[str] = Field(default_factory=list, max_length=10)
    kyc_reference: str = Field(default="", max_length=60)


def make_account_application_router(service, db, require_officer, require_csrf) -> APIRouter:
    router = APIRouter(prefix="/api/officer/applications")

    def summary(application: dict[str, Any]) -> dict[str, Any]:
        from product_service import get_product_by_id
        payload = service.payload(application["reference"])
        name = payload.get("full_name") or (db.get_customer(application.get("customer_id") or "") or {}).get("display_name")
        mobile = str(payload.get("mobile") or "")
        return {**{k: application[k] for k in ("reference", "product_id", "kind", "track", "customer_id", "status",
                                               "created_at", "updated_at", "reapplied_from")},
                "product": (get_product_by_id(application["product_id"]) or {}).get("title", application["product_id"]),
                "applicant": name, "mobile_masked": f"••••••{mobile[-4:]}" if mobile else None,
                "kyc_required": kyc_required(application), "attempts": (application.get("rpa") or {}).get("attempts", 0),
                "last_error": (application.get("rpa") or {}).get("last_error")}

    def kyc_required(application: dict[str, Any]) -> bool:
        if application["kind"] != "SAVINGS" or application["status"] != "SUBMITTED":
            return False
        return application["track"] == "NEW_TO_BANK" or (db.get_kyc_profile(application["customer_id"]) or {}).get("status") != "VERIFIED"

    def found(reference: str) -> dict[str, Any]:
        application = service.get(reference.upper())
        if not application:
            raise HTTPException(status_code=404, detail="Application not found")
        return application

    @router.get("")
    async def queue(view: str = "review", context=Depends(require_officer)):
        """review: waiting for an officer (new, robot failed, core refused); core: with the robot; done: opened or rejected."""
        del context
        statuses = {"review": NEEDS_OFFICER, "core": IN_CORE, "done": DONE}.get(view)
        if statuses is None:
            raise HTTPException(status_code=422, detail="view must be review, core or done")
        applications = [summary(a) for a in service.find(statuses, limit=200)]
        counts = {name: len(service.find(group, limit=500)) for name, group in
                  (("review", NEEDS_OFFICER), ("core", IN_CORE), ("done", DONE))}
        return {"applications": applications, "counts": counts, "kyc_checks": sorted(KYC_CHECKS)}

    @router.get("/{reference}")
    async def detail(reference: str, context=Depends(require_officer)):
        application = found(reference)
        db.append_audit("ACCOUNT_APPLICATION_VIEWED", actor="officer", approver_id=context.user_id,
                        approval_request_id=application["reference"], customer_id=application.get("customer_id"),
                        summary=f"Officer opened application {application['reference']}")
        worker = getattr(service, "worker", None)
        mem_shot = worker.latest_screenshot.get(application["reference"]) if worker else None
        db_shot = (application.get("rpa") or {}).get("latest_screenshot")
        return {**summary(application), "payload": service.payload(application["reference"]),
                "documents": application["documents"], "findings": application.get("findings", []), "decision": application["decision"],
                "kyc_verification": application["kyc_verification"], "cbs": application["cbs"],
                "history": application["history"], "events": (application.get("rpa") or {}).get("events", []),
                "screenshot": mem_shot or db_shot,
                "robot_running": bool(worker), "kyc_checks": sorted(KYC_CHECKS)}

    @router.get("/{reference}/documents/{document_id}")
    async def document(reference: str, document_id: str, context=Depends(require_officer)):
        """One uploaded KYC document, for the officer to check by eye. Every view is audited."""
        application = found(reference)
        try:
            content, mime, kind = service.document(application["reference"], document_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Document not found") from exc
        db.append_audit("APPLICATION_DOCUMENT_VIEWED", actor="officer", approver_id=context.user_id,
                        approval_request_id=application["reference"], summary=f"Officer viewed the {kind} of {application['reference']}")
        return Response(content, media_type=mime, headers={"Cache-Control": "no-store", "Content-Disposition": "inline",
                                                           "X-Content-Type-Options": "nosniff"})

    @router.get("/{reference}/robot")
    async def robot(reference: str, context=Depends(require_officer)):
        """Polled while the robot works: status, steps so far and its latest screenshot."""
        del context
        application = found(reference)
        worker = getattr(service, "worker", None)
        mem_shot = worker.latest_screenshot.get(application["reference"]) if worker else None
        db_shot = (application.get("rpa") or {}).get("latest_screenshot")
        return {"status": application["status"], "cbs": application["cbs"], "attempts": (application.get("rpa") or {}).get("attempts", 0),
                "last_error": (application.get("rpa") or {}).get("last_error"), "events": (application.get("rpa") or {}).get("events", []),
                "screenshot": mem_shot or db_shot}

    @router.post("/{reference}/decision")
    async def decide(reference: str, req: ApplicationDecision, context=Depends(require_csrf)):
        require_officer(context)
        try:
            decided = service.decide(found(reference)["reference"], officer_user_id=context.user_id, action=req.action,
                                     reason=req.reason, kyc_checks=req.kyc_checks, kyc_reference=req.kyc_reference)
        except ApplicationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return summary(decided)

    @router.post("/{reference}/retry")
    async def retry(reference: str, context=Depends(require_csrf)):
        require_officer(context)
        try:
            return summary(service.retry(found(reference)["reference"], officer_user_id=context.user_id))
        except ApplicationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    return router
