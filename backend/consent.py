"""Consent per action: which active customer consent an agent action relies on (DPDP Act 2023, purpose limitation)."""

from __future__ import annotations

from typing import Optional, Tuple

from sqlalchemy import select

from auth_service import CONSENT_PURPOSE, TERMS_VERSION
from persistence import ConsentRecord


def for_action(db, customer_id: Optional[str], scope: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """(consent id to record on the audit trail, reason to refuse). Scope comes from the tool registry."""
    if not scope or scope == "none":
        return None, None
    if not customer_id:
        return None, "CONSENT_REQUIRED"
    if scope == "marketing":  # a separate purpose the customer turns on in Settings
        from backend.offers import consented
        return ("MARKETING_PREFERENCE", None) if consented(db.snapshot(), customer_id) else (None, "MARKETING_CONSENT_REQUIRED")
    with db.runtime.sessions() as session:
        row = session.scalar(select(ConsentRecord).where(
            ConsentRecord.customer_id == customer_id, ConsentRecord.purpose == CONSENT_PURPOSE,
            ConsentRecord.revoked_at.is_(None), ConsentRecord.terms_version == TERMS_VERSION,
        ).order_by(ConsentRecord.granted_at.desc()))
    if not row:
        return None, "CONSENT_REQUIRED"
    if scope not in (row.scope or []):
        return None, f"CONSENT_SCOPE_MISSING:{scope}"
    return row.id, None
