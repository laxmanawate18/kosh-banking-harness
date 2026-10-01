from __future__ import annotations
from enum import Enum
from typing import Dict, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field


class SelectorStrategy(BaseModel):
    strategy: Literal["id", "name", "css", "label_text"]
    value: str


class StepAction(str, Enum):
    NAVIGATE = "navigate"
    TYPE = "type"
    SELECT_OPTION = "select_option"
    READ_BACK = "read_back"
    SUBMIT = "submit"


class StepDefinition(BaseModel):
    step_id: str
    action: StepAction
    screen_name: str
    target: Optional[Dict[str, SelectorStrategy]] = None
    field_key: Optional[str] = None
    expected_value: Optional[str] = None
    timeout_ms: int = 5000


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


class JobStatus(str, Enum):
    PENDING = "PENDING"
    EXECUTING = "EXECUTING"
    SUBMITTED = "SUBMITTED"
    UNKNOWN = "UNKNOWN"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
