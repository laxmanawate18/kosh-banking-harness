"""Signed-out product catalogue, onboarding, and sales-chat routes."""

from __future__ import annotations

import asyncio
import os
import re
import uuid
from typing import Callable

try:
    from asyncio import timeout as async_timeout
except ImportError:
    from async_timeout import timeout as async_timeout


from fastapi import APIRouter, HTTPException, Request, Response

from backend.agent_config import create_agent_config, visitor_reply
from backend.api_models import ProductApplyRequest, PublicChatRequest
from auth_service import AuthService, normalize_phone
from product_service import (
    SalesSessionContext,
    auth_challenge_presentation,
    chat_text,
    extract_dynamic_suggestions,
    get_all_products,
    get_product_by_id,
    guarded_sales_prompt_reply,
    inr,
    is_auth_required_reply,
    is_personal_banking_inquiry,
    leaks_internal_prompt,
    sales_advisor,
)


def make_public_router(db, auth_service: AuthService, limiter, agent_factory: Callable):
    router = APIRouter()

    @router.get("/api/auth/public-config")
    async def auth_public_config(request: Request):
        config = {
            "gcp_project_id": os.getenv("GOOGLE_CLOUD_PROJECT") or os.getenv("PROJECT_ID") or "project-3da8cb5f-328e-44d3-b7a",
            "firebase_api_key": os.getenv("FIREBASE_WEB_API_KEY") or os.getenv("GCP_IDENTITY_API_KEY") or "",
            "firebase_auth_domain": os.getenv("FIREBASE_AUTH_DOMAIN") or f"{os.getenv('FIREBASE_PROJECT_ID') or os.getenv('GOOGLE_CLOUD_PROJECT') or os.getenv('PROJECT_ID') or ''}.firebaseapp.com",
            "recaptcha_site_key": os.getenv("RECAPTCHA_ENTERPRISE_SITE_KEY") or "",
            "oauth_start_url": "/api/auth/start",
            "is_local": False,
        }
        # The Firebase console test number/code is a local-development convenience only.
        production = os.getenv("ENVIRONMENT", "development").lower() in {"production", "prod"}
        if not production and request.url.hostname in {"127.0.0.1", "localhost", "::1"}:
            config.update(is_local=True,
                          firebase_test_phone=os.getenv("AUTH_FIREBASE_TEST_PHONE", "+919876543210"),
                          firebase_test_code=os.getenv("AUTH_FIREBASE_TEST_CODE", "246810"))
        return config

    @router.get("/api/products")
    async def get_products(category: str | None = None):
        products = get_all_products(category)
        return {
            "products": products,
            "categories": [
                {"id": "all", "label": "All Products"},
                {"id": "savings", "label": "Savings Accounts"},
                {"id": "cards", "label": "Credit Cards"},
                {"id": "deposits", "label": "Fixed Deposits"},
                {"id": "loans", "label": "Loans & Credit"},
                {"id": "wealth", "label": "Investments & Demat"},
            ],
            "total_count": len(products),
        }

    @router.post("/api/products/apply")
    @limiter.limit("10/minute")
    async def apply_product(req: ProductApplyRequest, request: Request, response: Response):
        del response
        product = get_product_by_id(req.product_id)
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")

        full_name = (req.full_name or "").strip()
        normalized_phone = normalize_phone(req.phone_number or "")
        if len(full_name) < 2 or len(full_name) > 100 or not re.fullmatch(r"\+91[6-9][0-9]{9}", normalized_phone):
            raise HTTPException(422, "Enter your full name and a valid Indian mobile number")
        category = (product.get("category") or "").lower()
        pan = (req.pan_number or "").strip().upper()
        if (pan or category in {"cards", "loans"}) and not re.fullmatch(r"[A-Z]{5}[0-9]{4}[A-Z]", pan):
            raise HTTPException(422, "Enter a valid PAN, for example ABCDE1234F")
        if req.pincode and not re.fullmatch(r"[1-9][0-9]{5}", req.pincode.strip()):
            raise HTTPException(422, "Enter a valid 6-digit PIN code")

        # -------------------------------------------------------------
        # 1. DEDICATED CREDIT CARD APPLICATION (NO BANK ACCOUNT CREATED)
        # -------------------------------------------------------------
        if category == "cards":
            pan_raw = (req.pan_number or "").strip().upper()
            pan_masked = f"{pan_raw[:2]}••••{pan_raw[-2:]}" if len(pan_raw) == 10 else "ABCDE••••F"
            emp_type = (req.employment_type or "Salaried").strip()
            income = float(req.monthly_income or 0)
            
            # Determine in-principle limit
            if "student" in emp_type.lower():
                credit_limit = 25000
                status_note = "Student Pre-Approval against College Verification"
            elif income > 0:
                credit_limit = min(max(int(income * 3), 50000), 500000)
                status_note = f"Pre-Approved based on monthly income of {inr(income)}"
            else:
                credit_limit = 150000
                status_note = "Standard In-Principle Approval"

            app_ref = f"CC-APP-{uuid.uuid4().hex[:6].upper()}"

            # Log lead and audit event
            db.record_lead(
                customer_id=None,
                session_id=None,
                category="CARDS",
                sub_type=product.get("title", "Credit Card"),
                amount_requested_minor=credit_limit * 100,
                employment_type=emp_type.upper(),
                monthly_income_minor=int(income * 100) if income else None,
                preferences={
                    "applicant_name": full_name,
                    "phone_number": normalized_phone,
                    "email": req.email or "",
                    "app_ref": app_ref,
                    "pan_masked": pan_masked,
                    "pincode": req.pincode,
                    "employer_or_college": req.employer_or_college,
                },
                status="PENDING_APPROVAL",
                recommended_product_id=product["id"],
                special_offer_note=f"Approved limit {inr(credit_limit)} with zero joining fees on instant KYC",
                follow_up_pitch=f"Your credit card application {app_ref} has been soft-approved!",
                notes=f"Applicant {full_name}, Phone {normalized_phone}, Email {req.email or 'N/A'}, PAN {pan_masked}, {emp_type}",
            )
            db.append_audit(
                "CREDIT_CARD_APPLICATION_SUBMITTED",
                actor="visitor",
                summary=f"Credit Card application {app_ref} submitted for {product['title']}",
                details={"app_ref": app_ref, "product_id": product["id"], "name": full_name, "limit": credit_limit},
            )

            return {
                "success": True,
                "application_type": "credit_card",
                "application_ref": app_ref,
                "message": f"Your application for {product['title']} has been submitted successfully.",
                "status": "IN_PRINCIPLE_SANCTIONED",
                "status_note": status_note,
                "card_title": product["title"],
                "credit_limit": inr(credit_limit),
                "applicant_name": full_name,
                "phone_number": normalized_phone,
                "pan_masked": pan_masked,
                "employment_type": emp_type,
                "pincode": req.pincode or "400001",
                "next_steps": "Digital video-KYC and bureau verification are underway. No bank account is created. Your card will be dispatched to your delivery PIN code upon completion.",
                "product": {
                    "id": product["id"],
                    "title": product["title"],
                    "category": product["category"],
                    "headline_rate": product.get("headline_rate", ""),
                },
                "cross_sell_offer": {
                    "title": "Kosh Suvarna Premier Savings Account",
                    "headline": "7.20% p.a. + Auto-Pay & 500 Bonus Reward Points",
                    "description": "Would you like to link a zero-balance Sovereign Savings Account to automate credit card payments with zero charges?",
                    "product_id": "PROD-SAV-PREMIER",
                },
            }

        # -------------------------------------------------------------
        # 2. DEDICATED LOAN APPLICATION (NO BANK ACCOUNT CREATED)
        # -------------------------------------------------------------
        if category == "loans":
            pan_raw = (req.pan_number or "").strip().upper()
            pan_masked = f"{pan_raw[:2]}••••{pan_raw[-2:]}" if len(pan_raw) == 10 else "ABCDE••••F"
            emp_type = (req.employment_type or "Salaried").strip()
            income = float(req.monthly_income or 0)
            loan_amt = float(req.loan_amount or 500000.0)
            tenure = int(req.loan_tenure_months or 36)
            purpose = req.loan_purpose or "General Purpose / Personal Need"

            # Parse interest rate
            rate_str = product.get("headline_rate", "10.25% p.a.")
            rate_match = re.search(r"(\d+(\.\d+)?)", rate_str)
            annual_rate = float(rate_match.group(1)) if rate_match else 10.25
            r = (annual_rate / 100) / 12
            if r > 0 and tenure > 0:
                emi = (loan_amt * r * ((1 + r) ** tenure)) / (((1 + r) ** tenure) - 1)
            else:
                emi = loan_amt / max(tenure, 1)

            app_ref = f"LN-APP-{uuid.uuid4().hex[:6].upper()}"

            # Log lead and audit event
            db.record_lead(
                customer_id=None,
                session_id=None,
                category="LOANS",
                sub_type=product.get("title", "Loan"),
                amount_requested_minor=int(loan_amt * 100),
                tenure_months=tenure,
                employment_type=emp_type.upper(),
                monthly_income_minor=int(income * 100) if income else None,
                preferences={
                    "applicant_name": full_name,
                    "phone_number": normalized_phone,
                    "email": req.email or "",
                    "app_ref": app_ref,
                    "purpose": purpose,
                    "pan_masked": pan_masked,
                    "pincode": req.pincode,
                },
                status="PENDING_APPROVAL",
                recommended_product_id=product["id"],
                special_offer_note=f"In-principle sanctioned: {inr(loan_amt)} @ {annual_rate:.2f}% p.a. for {tenure} months (EMI: {inr(round(emi))}/mo)",
                follow_up_pitch=f"Your loan application {app_ref} has received in-principle sanction!",
                notes=f"Applicant {full_name}, Phone {normalized_phone}, Email {req.email or 'N/A'}, Purpose: {purpose}, EMI: {inr(round(emi))}/mo",
            )
            db.append_audit(
                "LOAN_APPLICATION_SUBMITTED",
                actor="visitor",
                summary=f"Loan application {app_ref} submitted for {product['title']}",
                details={"app_ref": app_ref, "product_id": product["id"], "name": full_name, "amount": loan_amt, "emi": round(emi)},
            )

            return {
                "success": True,
                "application_type": "loan",
                "application_ref": app_ref,
                "message": f"Your loan application for {product['title']} is in-principle sanctioned.",
                "status": "IN_PRINCIPLE_SANCTIONED",
                "loan_title": product["title"],
                "loan_amount": inr(loan_amt, 2),
                "tenure_months": tenure,
                "estimated_emi": f"{inr(round(emi))}/month",
                "headline_rate": f"{annual_rate:.2f}% p.a.",
                "purpose": purpose,
                "applicant_name": full_name,
                "phone_number": normalized_phone,
                "pan_masked": pan_masked,
                "next_steps": "A Senior Loan Relationship Manager will connect with you within 2 hours. Funds can be disbursed directly into ANY existing bank account of your choice.",
                "product": {
                    "id": product["id"],
                    "title": product["title"],
                    "category": product["category"],
                    "headline_rate": product.get("headline_rate", ""),
                },
                "cross_sell_offer": {
                    "title": "Kosh Suvarna Premier Account",
                    "headline": "Zero Processing Fee & Priority Disbursal",
                    "description": "Open a Kosh Suvarna Premier Account to receive priority loan disbursement with zero processing charges.",
                    "product_id": "PROD-SAV-PREMIER",
                },
            }

        # -------------------------------------------------------------
        # 3. SAVINGS / DEPOSIT ACCOUNT OPENING (QUEUED FOR OFFICER APPROVAL)
        # -------------------------------------------------------------
        if auth_service.profile_exists(normalized_phone):
            raise HTTPException(409, "This mobile number already has a banking profile. Sign in to continue.")
        requested_username = (req.username or "").strip().lower() or None
        if requested_username and (auth_service.username_exists(requested_username)
                                   or not re.fullmatch(r"[a-z][a-z0-9._]{3,31}", requested_username)):
            raise HTTPException(409, "That username is not available. Choose another or leave it blank.")

        pan_raw = (req.pan_number or "").strip().upper()
        pan_masked = f"{pan_raw[:2]}••••{pan_raw[-2:]}" if len(pan_raw) == 10 else "ABCDE••••F"
        emp_type = (req.employment_type or "Salaried").strip()
        income = float(req.monthly_income or 0)
        email = (req.email or "").strip()
        if not email:
            first_slug = re.sub(r"[^a-z0-9]", "", full_name.lower().split()[0]) or "applicant"
            email = f"{first_slug}@example.com"

        app_ref = f"SAV-APP-{uuid.uuid4().hex[:6].upper()}"

        min_bal_raw = str(product.get("min_balance", "10000"))
        digits_match = re.search(r"(\d+)", min_bal_raw.replace(",", ""))
        min_bal = float(digits_match.group(1)) if digits_match else 10000.0

        db.record_lead(
            customer_id=None,
            session_id=None,
            category="SAVINGS",
            sub_type=product.get("title", "Savings Account"),
            amount_requested_minor=int(min_bal * 100),
            employment_type=emp_type.upper(),
            monthly_income_minor=int(income * 100) if income else None,
            preferences={
                "applicant_name": full_name,
                "phone_number": normalized_phone,
                "email": email,
                "app_ref": app_ref,
                "pan_masked": pan_masked,
                "pincode": req.pincode or "400001",
                "employer_or_college": req.employer_or_college,
                "requested_username": requested_username,
                "delivery_status": "PENDING",
            },
            status="PENDING_APPROVAL",
            recommended_product_id=product["id"],
            special_offer_note=f"High-yield {product.get('headline_rate', '7.20% p.a.')} with sovereign metal debit card",
            follow_up_pitch=f"Your application {app_ref} for {product['title']} is under review by our operations team.",
            notes=f"Applicant {full_name}, Phone {normalized_phone}, Email {email}, PAN {pan_masked}, Pending Officer Approval for credentials",
        )

        db.append_audit(
            "SAVINGS_APPLICATION_SUBMITTED",
            actor="visitor",
            summary=f"Savings application {app_ref} submitted for {product['title']}",
            details={"app_ref": app_ref, "product_id": product["id"], "name": full_name, "email": email},
        )

        return {
            "success": True,
            "application_type": "savings_account",
            "application_ref": app_ref,
            "status": "PENDING_APPROVAL",
            "message": f"Your application for {product['title']} has been submitted for bank officer review. Upon approval, your credentials will be delivered to your email.",
            "applicant_name": full_name,
            "phone_number": normalized_phone,
            "email": email,
            "pan_masked": pan_masked,
            "next_steps": f"A Bank Operations Officer will review your application. Once approved, your digital banking credentials and Customer ID will be delivered to {email}.",
            "product": {
                "id": product["id"],
                "title": product["title"],
                "category": product["category"],
                "headline_rate": product.get("headline_rate", ""),
            },
        }


    @router.post("/api/public/chat")
    @limiter.limit("30/minute")
    async def public_sales_chat(req: PublicChatRequest, request: Request, response: Response):
        del response
        if not req.prompt.strip():
            raise HTTPException(422, "Enter a non-empty message.")
        sales_context = SalesSessionContext()
        answer = sales_advisor.answer_query(req.prompt, context=sales_context)
        try:
            async with async_timeout(90):
                guarded = guarded_sales_prompt_reply(req.prompt)

                if guarded:
                    answer["text"] = guarded
                elif is_personal_banking_inquiry(req.prompt):
                    answer["text"] = chat_text("auth_prompt")
                    answer["presentation"] = auth_challenge_presentation()
                    answer["action"] = None
                else:
                    async with agent_factory(create_agent_config(
                        "public-chat", visitor=True, session_context={"sales_context": sales_context}
                    )) as agent:
                        raw_reply = "".join([
                            text async for text in visitor_reply(agent, req.prompt, sales_context)
                        ])
                    clean_reply, suggestions = extract_dynamic_suggestions(raw_reply)
                    answer["text"] = chat_text("guarded") if leaks_internal_prompt(clean_reply) else clean_reply
                    if suggestions:
                        answer["suggested_queries"] = suggestions
                    if answer.get("companion_cross_sell"):
                        answer["presentation"] = answer["companion_cross_sell"]
                    if is_auth_required_reply(answer.get("text", "")):
                        answer["presentation"] = auth_challenge_presentation()
                        answer["action"] = None
        except Exception as exc:
            raise HTTPException(503, chat_text("advisor_error")) from exc
        return {
            "role": "assistant",
            "session_id": req.session_id or f"GUEST-{uuid.uuid4().hex[:8]}",
            "response": answer,
        }

    return router
