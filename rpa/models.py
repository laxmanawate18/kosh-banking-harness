from __future__ import annotations
import hashlib
import json
from enum import Enum
from typing import Dict, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field


class SelectorStrategy(BaseModel):
    strategy: Literal["id", "name", "css", "xpath", "label_text", "relative", "visual"]
    value: str
    anchor: Optional[str] = None
    offset: Optional[str] = None
    template_hash: Optional[str] = None


class StepAction(str, Enum):
    NAVIGATE = "navigate"
    CLICK = "click"
    TYPE = "type"
    SELECT_OPTION = "select_option"
    ASSERT_TEXT = "assert_text"
    ASSERT_VISIBLE = "assert_visible"
    READ_BACK = "read_back"
    SUBMIT = "submit"


class StepDefinition(BaseModel):
    step_id: str
    action: StepAction
    screen_name: str
    target: Optional[Dict[str, SelectorStrategy]] = None
    field_key: Optional[str] = None
    expected_value: Optional[str] = None
    pre_condition: Optional[str] = None
    post_condition: Optional[str] = None
    timeout_ms: int = 5000
    is_state_changing: bool = True
    can_retry_on_failure: bool = True


class AccountApplicationSnapshot(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    application_reference: str = Field(pattern=r"^(APP|REQ)-[A-Za-z0-9-]+$")
    customer_name: str = Field(min_length=2, max_length=100)
    pan: str = Field(pattern=r"^[A-Z]{5}[0-9]{4}[A-Z]$")
    aadhaar_last4: str = Field(pattern=r"^\d{4}$")
    dob: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    mobile: str = Field(pattern=r"^\d{10}$")
    email: str = Field(pattern=r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
    address_line: str = Field(min_length=5, max_length=200)
    city: str = Field(min_length=2, max_length=50)
    pincode: str = Field(pattern=r"^\d{6}$")
    account_type: Literal["SAVINGS_INDIVIDUAL", "SALARY_PRIVILEGE", "CURRENT_INDIVIDUAL"] = "SAVINGS_INDIVIDUAL"
    nominee_name: Optional[str] = None
    nominee_relationship: Optional[str] = None

    def compute_digest(self) -> str:
        payload = self.model_dump(mode="json")
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class JobStatus(str, Enum):
    PENDING = "PENDING"
    LEASED = "LEASED"
    EXECUTING = "EXECUTING"
    PRE_SUBMIT_VERIFIED = "PRE_SUBMIT_VERIFIED"
    SUBMITTED = "SUBMITTED"
    UNKNOWN = "UNKNOWN"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CIRCUIT_BROKEN = "CIRCUIT_BROKEN"
