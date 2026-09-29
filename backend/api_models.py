"""HTTP request contracts for the Kosh API."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class SessionCreateRequest(BaseModel):
    title: str = Field(default="New Chat", max_length=120)
    messages: Optional[List[Dict[str, Any]]] = None


class SessionUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, max_length=120)


class ChallengeVerifyRequest(BaseModel):
    transaction_digest: str = Field(min_length=1, max_length=128)


class GCPPhoneLoginRequest(BaseModel):
    id_token: str


class StepUpRequest(BaseModel):
    code: str = Field(min_length=1, max_length=10)


class ProductApplyRequest(BaseModel):
    product_id: str = "PROD-SAV-PREMIER"
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None
    pan_number: Optional[str] = None
    dob: Optional[str] = None
    employment_type: Optional[str] = None
    employer_or_college: Optional[str] = None
    monthly_income: Optional[float] = None
    pincode: Optional[str] = None
    loan_amount: Optional[float] = None
    loan_tenure_months: Optional[int] = None
    loan_purpose: Optional[str] = None
    existing_emi: Optional[float] = None
    username: Optional[str] = None
    password: Optional[str] = None
    auto_login: Optional[bool] = False



class ConsentRequest(BaseModel):
    accepted: bool
    scope: Optional[List[str]] = None


class ApprovalDecisionRequest(BaseModel):
    action: str
    reason: str
    override_justification: Optional[str] = None
    verification_checks: List[str] = Field(default_factory=list)
    verification_reference: str = Field(default="", max_length=300)


class SpeakRequest(BaseModel):
    text: str = Field(min_length=1, max_length=6000)


class ApplicationStatusRequest(BaseModel):
    reference: str = Field(min_length=6, max_length=20)
    mobile: str = Field(min_length=10, max_length=20)
