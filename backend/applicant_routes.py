"""Applying for a savings account or a fixed deposit.

Visitors (new to bank) apply for savings with the full KYC form and documents; no sign-in. Signed-in customers open
another savings account or book an FD after verifying their identity (step-up), with their digital-banking consent.
The applicant tracks the application by reference and mobile, sees a rejection reason, and can apply again.
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from account_applications import ApplicationError, RELATIONSHIPS, clean_savings_form, read_documents

MATURITY = {"RENEW_PRINCIPAL_INTEREST", "RENEW_PRINCIPAL", "CLOSE_AND_CREDIT"}
SENSITIVE = {"pan_number", "date_of_birth", "document_last4", "declarations_accepted"}  # never sent back by prefill


class SavingsApplication(BaseModel):
    product_id: str = Field(pattern=r"^PROD-[A-Z0-9-]{1,40}$")
    fields: dict[str, Any] = Field(max_length=20)
    documents: list[dict[str, Any]] = Field(default_factory=list, max_length=3)
    reapplied_from: Optional[str] = Field(default=None, max_length=40)


class Lookup(BaseModel):
    reference: str = Field(max_length=40)
    mobile: str = Field(max_length=20)


class CustomerSavings(BaseModel):
    product_id: str = Field(pattern=r"^PROD-[A-Z0-9-]{1,40}$")
    nominee_name: str = Field(default="", max_length=100)
    nominee_relationship: str = Field(default="", max_length=20)


class DepositApplication(BaseModel):
    product_id: str = Field(default="PROD-FD-SMART", pattern=r"^PROD-[A-Z0-9-]{1,40}$")
    funding_account_id: str = Field(pattern=r"^ACC-[A-Z0-9-]{1,40}$")
    amount_minor: int = Field(ge=100_000, le=10_000_000_000)  # Rs 1,000 to Rs 10 crore
    tenure_months: int = Field(ge=6, le=120)
    maturity_instruction: str = "RENEW_PRINCIPAL_INTEREST"


def _category(product_id: str) -> str:
    from product_service import get_product_by_id
    return ((get_product_by_id(product_id) or {}).get("category") or "").lower()


def make_applicant_router(service, db, auth_service, limiter, require_customer, require_customer_csrf, active_consent) -> APIRouter:
    router = APIRouter()

    def refused(exc: ApplicationError) -> HTTPException:
        return HTTPException(status_code=422, detail=str(exc))

    # ---- visitors: a new customer's savings account ------------------------------------------------------------
    @router.post("/api/applications/account", status_code=201)
    @limiter.limit("5/minute")
    async def apply_savings(body: SavingsApplication, request: Request, response: Response):
        del request, response
        if _category(body.product_id) != "savings":
            raise HTTPException(422, "Choose a Kosh savings account.")
        try:
            form = clean_savings_form(body.fields)
            if auth_service.profile_exists("+91" + form["mobile"]):
                raise HTTPException(409, "This mobile number already banks with Kosh. Sign in to open another account.")
            if body.reapplied_from:
                service.prefill_for_reapply(body.reapplied_from, form["mobile"])  # only a rejected application of this mobile
            documents, findings = read_documents(body.documents, form)
            application = service.submit(product_id=body.product_id, mobile=form["mobile"], payload=form, documents=documents,
                                         findings=findings, reapplied_from=body.reapplied_from)
        except ApplicationError as exc:
            raise refused(exc) from exc
        return service.applicant_status(application["reference"], form["mobile"])

    @router.post("/api/applications/prefill")
    @limiter.limit("10/minute")
    async def prefill(body: Lookup, request: Request, response: Response):
        """A rejected application's form, to apply again. PAN, date of birth and documents are entered again."""
        del request, response
        try:
            found = service.prefill_for_reapply(body.reference, body.mobile)
        except ApplicationError as exc:
            raise HTTPException(404, "No rejected application matches that reference and mobile number.") from exc
        return {**found, "fields": {k: v for k, v in found["fields"].items() if k not in SENSITIVE}}

    # ---- signed-in customers ----------------------------------------------------------------------------------
    def customer_mobile(customer_id: str) -> str:
        customer = db.get_customer(customer_id) or {}
        return customer.get("phone_number") or customer_id  # the duplicate guard and status need a stable key

    def verified(context) -> None:
        active_consent(context)
        if context.assurance_level != "L3":
            raise HTTPException(403, {"code": "STEP_UP_REQUIRED", "message": "Verify your identity to open an account"})

    @router.get("/api/customer/applications")
    async def mine(context=Depends(require_customer)):
        rows = service.find(customer_id=context.customer_id, limit=20)
        mobile = customer_mobile(context.customer_id)
        return {"applications": [{**(service.applicant_status(r["reference"], mobile) or {}), "status_code": r["status"],
                                  "cbs": {k: v for k, v in r["cbs"].items() if k in {"fd_number", "account_number"}}}
                                 for r in rows]}

    @router.post("/api/customer/applications/account", status_code=201)
    async def open_savings(body: CustomerSavings, context=Depends(require_customer_csrf)):
        verified(context)
        if _category(body.product_id) != "savings":
            raise HTTPException(422, "Choose a Kosh savings account.")
        if (db.get_kyc_profile(context.customer_id) or {}).get("status") != "VERIFIED":
            raise HTTPException(409, "KYC comes first: complete your KYC, then open another account.")
        nominee = " ".join(body.nominee_name.split())
        if nominee and body.nominee_relationship not in RELATIONSHIPS:
            raise HTTPException(422, "Choose the nominee's relationship to you.")
        try:
            application = service.submit(product_id=body.product_id, mobile=customer_mobile(context.customer_id),
                                         payload={"nominee_name": nominee, "nominee_relationship": body.nominee_relationship if nominee else ""},
                                         customer_id=context.customer_id, user_id=context.user_id)
        except ApplicationError as exc:
            raise refused(exc) from exc
        return {**service.applicant_status(application["reference"], customer_mobile(context.customer_id)), "status_code": application["status"]}

    @router.post("/api/customer/applications/deposit", status_code=201)
    async def book_deposit(body: DepositApplication, context=Depends(require_customer_csrf)):
        verified(context)
        if _category(body.product_id) != "deposits" or body.maturity_instruction not in MATURITY:
            raise HTTPException(422, "Choose the fixed deposit and what happens at maturity.")
        try:
            application = service.submit(product_id=body.product_id, mobile=customer_mobile(context.customer_id),
                                         payload={"funding_account_id": body.funding_account_id, "amount_minor": body.amount_minor,
                                                  "tenure_months": body.tenure_months, "maturity_instruction": body.maturity_instruction},
                                         customer_id=context.customer_id, user_id=context.user_id)
        except ApplicationError as exc:
            raise refused(exc) from exc
        return {**service.applicant_status(application["reference"], customer_mobile(context.customer_id)), "status_code": application["status"]}

    return router
