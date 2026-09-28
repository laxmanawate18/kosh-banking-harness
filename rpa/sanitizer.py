import re
from typing import Literal

ALLOWED_PATTERNS = {
    "name": re.compile(r"^[A-Za-z\s.']{2,100}$"),
    "pan": re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$"),
    "mobile": re.compile(r"^[0-9]{10}$"),
    "pincode": re.compile(r"^[0-9]{6}$"),
    "dob": re.compile(r"^\d{4}-\d{2}-\d{2}$"),
    "address": re.compile(r"^[A-Za-z0-9\s,./#\-]{5,200}$"),
}

PROMPT_INJECTION_WORDS = [
    "ignore previous", "system prompt", "administrator", "bypass",
    "<script", "drop table", "select *", "eval(", "exec("
]


def sanitize_field(value: str, field_type: Literal["name", "pan", "mobile", "pincode", "dob", "address"]) -> str:
    cleaned = value.strip()
    lower = cleaned.lower()
    for needle in PROMPT_INJECTION_WORDS:
        if needle in lower:
            raise ValueError(f"Invalid characters in field: rejected security signature '{needle}'")

    pattern = ALLOWED_PATTERNS.get(field_type)
    if pattern and not pattern.match(cleaned):
        raise ValueError(f"Invalid characters in field '{field_type}': value '{cleaned}' violates format")

    if field_type in ("name", "pan"):
        return cleaned.upper()
    return cleaned
